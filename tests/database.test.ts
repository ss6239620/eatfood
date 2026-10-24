import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { sql } from "../src/lib/db";
import {
  createOrder,
  getOrder,
  issueBill,
  paymentEvent,
  transition,
} from "../src/lib/orders";
import type { Staff } from "../src/lib/types";
import { tick } from "../src/lib/worker";
// Never send real WhatsApp messages from database tests.
process.env.WHATSAPP_ACCESS_TOKEN = "";
process.env.WHATSAPP_PHONE_NUMBER_ID = "";
const restaurantId = "test-" + randomUUID();
const owner: Staff = {
    id: "test-owner",
    restaurant_id: restaurantId,
    name: "Test Owner",
    email: "test@local.test",
    role: "owner",
  },
  other = { ...owner, restaurant_id: "r_other" };
const input = (online = false) => ({
  version: 1,
  eventId: randomUUID(),
  restaurantId,
  customer: {
    id: "customer-a",
    name: "Test Diner",
    phone: "+919876543210",
    verified: true,
  },
  items: [{ id: restaurantId + "-item", quantity: 1, optionIds: [] }],
  fulfillment: "pickup",
  paymentMethod: online ? "online" : "cod",
});
before(async () => {
  const [r] = await sql`SELECT settings FROM restaurants WHERE id='r_demo'`;
  await sql`INSERT INTO restaurants(id,slug,name,settings) VALUES(${restaurantId},${restaurantId},'Test restaurant',${JSON.stringify({ ...r.settings, open: true, opensAt: "00:00", closesAt: "00:00", minimumOrder: 0 })}::jsonb)`;
  await sql`INSERT INTO menu_items(id,restaurant_id,name,description,category,price,image) VALUES(${restaurantId + "-item"},${restaurantId},'Test Bowl','Test','Bowls',20000,'')`;
});
after(async () => {
  await sql.begin(async (tx) => {
    for (const table of [
      "payments",
      "bills",
      "message_jobs",
      "webhook_receipts",
      "order_events",
      "consent_records",
      "audit_events",
      "customer_sessions",
    ])
      await tx.unsafe(`DELETE FROM ${table} WHERE restaurant_id=$1`, [
        restaurantId,
      ]);
    await tx`DELETE FROM orders WHERE restaurant_id=${restaurantId}`;
    await tx`DELETE FROM menu_items WHERE restaurant_id=${restaurantId}`;
    await tx`DELETE FROM restaurants WHERE id=${restaurantId}`;
  });
  await sql.end();
});
test("concurrent repeated callbacks create one order and one message", async () => {
  const payload = input();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => createOrder(payload)),
  );
  assert.equal(new Set(results.map((r) => r.id)).size, 1);
  assert.equal(results.filter((r) => !r.duplicate).length, 1);
  const [count] =
    await sql`SELECT count(*)::int n FROM message_jobs WHERE order_id=${results[0].id}`;
  assert.equal(count.n, 1);
  await assert.rejects(
    () => createOrder({ ...payload, notes: "changed" }),
    /different order contents/,
  );
});
test("conflicting staff transitions and cross-tenant access are blocked", async () => {
  const o = await createOrder(input());
  const result = await Promise.allSettled([
    transition(o.id, owner, { status: "accepted", version: 1, estimate: 20 }),
    transition(o.id, owner, { status: "rejected", version: 1, reason: "Test" }),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(() => getOrder(o.id, other.restaurant_id), /not found/);
  await assert.rejects(
    () =>
      transition(o.id, other, { status: "accepted", version: 1, estimate: 20 }),
    /not found/,
  );
});
test("online acceptance requires payment; refunds and late successes remain separate", async () => {
  const o = await createOrder(input(true));
  await assert.rejects(
    () =>
      transition(o.id, owner, { status: "accepted", version: 1, estimate: 20 }),
    /verified/,
  );
  const event = {
    eventId: randomUUID(),
    kind: "success" as const,
    amount: o.total,
    currency: "INR",
  };
  await paymentEvent(o.id, owner, event);
  assert.equal((await paymentEvent(o.id, owner, event)).duplicate, true);
  let detail = await getOrder(o.id, restaurantId);
  await transition(o.id, owner, {
    status: "rejected",
    version: detail.order.version,
    reason: "Sold out",
  });
  detail = await getOrder(o.id, restaurantId);
  assert.equal(detail.order.payment_status, "refund_pending");
  await paymentEvent(o.id, owner, {
    eventId: randomUUID(),
    kind: "refund",
    amount: o.total,
    currency: "INR",
  });
  assert.equal(
    (await getOrder(o.id, restaurantId)).order.payment_status,
    "refunded",
  );
  const late = await createOrder(input(true));
  await transition(late.id, owner, {
    status: "rejected",
    version: 1,
    reason: "Closed",
  });
  await paymentEvent(late.id, owner, {
    ...event,
    eventId: randomUUID(),
    amount: late.total,
  });
  const l = await getOrder(late.id, restaurantId);
  assert.equal(l.order.status, "rejected");
  assert.equal(l.order.payment_status, "refund_pending");
});
test("COD stays unpaid through collection and repeated collection cannot double count", async () => {
  const o = await createOrder(input());
  let version = 1;
  for (const status of ["accepted", "preparing", "ready", "collected"]) {
    await transition(o.id, owner, { status, version: version++, estimate: 20 });
  }
  assert.equal(
    (await getOrder(o.id, restaurantId)).order.payment_status,
    "unpaid",
  );
  await paymentEvent(o.id, owner, {
    eventId: randomUUID(),
    kind: "cod",
    amount: o.total,
    currency: "INR",
  });
  await assert.rejects(
    () =>
      paymentEvent(o.id, owner, {
        eventId: randomUUID(),
        kind: "cod",
        amount: o.total,
        currency: "INR",
      }),
    /already recorded/,
  );
});
test("payment mismatches are visible and bill reprints are immutable", async () => {
  const o = await createOrder(input(true));
  await paymentEvent(o.id, owner, {
    eventId: randomUUID(),
    kind: "success",
    amount: 1,
    currency: "INR",
  });
  assert.match(
    (await getOrder(o.id, restaurantId)).order.review_reason || "",
    /mismatch/,
  );
  const b = await issueBill(o.id, owner);
  await sql`UPDATE orders SET customer_name='Changed after issue' WHERE id=${o.id}`;
  const reprint = await issueBill(o.id, owner);
  assert.equal(b.number, reprint.number);
  assert.equal(reprint.snapshot.order.customer_name, "Test Diner");
});
test("worker recovers expired leases, caps retries, and closes unaccepted orders", async () => {
  const o = await createOrder(input());
  await sql`UPDATE orders SET created_at=now()-interval '20 minutes' WHERE id=${o.id}`;
  const id = randomUUID();
  await sql`INSERT INTO message_jobs(id,restaurant_id,kind,payload,status,attempts,locked_at) VALUES(${id},${restaurantId},'test','{}','processing',1,now()-interval '2 minutes')`;
  await tick();
  assert.equal((await getOrder(o.id, restaurantId)).order.status, "rejected");
  const [j] =
    await sql`SELECT status,attempts FROM message_jobs WHERE id=${id}`;
  assert.equal(j.status, "simulated");
  assert.equal(j.attempts, 2);
  const failed = randomUUID();
  await sql`INSERT INTO message_jobs(id,restaurant_id,kind,payload,attempts) VALUES(${failed},${restaurantId},'test','{"forceFailure":true}',3)`;
  await tick();
  const [f] = await sql`SELECT status FROM message_jobs WHERE id=${failed}`;
  assert.equal(f.status, "failed");
});

test("delivery completes through its own states; corrections require owner audit", async () => {
  const o = await createOrder({
    ...input(),
    fulfillment: "delivery",
    address: { line: "24 Test Street", area: "Indiranagar" },
  });
  let version = 1;
  for (const status of [
    "accepted",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
  ])
    await transition(o.id, owner, { status, version: version++, estimate: 20 });
  await assert.rejects(
    () =>
      transition(
        o.id,
        { ...owner, role: "staff" },
        {
          status: "preparing",
          version,
          correction: true,
          reason: "Mistaken delivery",
        },
      ),
    /Owner corrections/,
  );
  await transition(o.id, owner, {
    status: "out_for_delivery",
    version,
    correction: true,
    reason: "Driver tapped delivered too early",
  });
  const detail = await getOrder(o.id, restaurantId);
  assert.equal(detail.order.status, "out_for_delivery");
  assert.match(detail.events.at(-1)?.reason || "", /Owner correction/);
});

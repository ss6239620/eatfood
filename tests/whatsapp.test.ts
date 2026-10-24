import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { sql } from "../src/lib/db";
import { hash } from "../src/lib/security";
import { createOrder } from "../src/lib/orders";
import {
  deliverMetaMessage,
  processMetaPayload,
  receiveMetaWebhook,
  validMetaSignature,
  verifyMetaChallenge,
} from "../src/lib/whatsapp";
const restaurantId = "meta-test-" + randomUUID();
const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "test-waba",
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "test-phone" },
            contacts: [
              { wa_id: "919999999999", profile: { name: "Test Guest" } },
            ],
            messages: [
              {
                id: "wamid.test-" + randomUUID(),
                from: "919999999999",
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "Hi" },
              },
            ],
          },
        },
      ],
    },
  ],
};
const original = { ...process.env };
let raw = "";
before(async () => {
  process.env.WHATSAPP_APP_SECRET = "unit-test-secret";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone";
  process.env.WHATSAPP_WABA_ID = "test-waba";
  process.env.WHATSAPP_RESTAURANT_ID = restaurantId;
  process.env.WHATSAPP_ACCESS_TOKEN = "unit-test-access";
  process.env.APP_URL = "https://test.example";
  const [r] = await sql`SELECT settings FROM restaurants WHERE id='r_demo'`;
  await sql`INSERT INTO restaurants(id,slug,name,settings) VALUES(${restaurantId},${restaurantId},'Test Kitchen',${JSON.stringify({ ...r.settings, open: true, minimumOrder: 0, opensAt: "00:00", closesAt: "00:00" })}::jsonb)`;
  await sql`INSERT INTO menu_items(id,restaurant_id,name,description,category,price,image) VALUES(${restaurantId + "-bowl"},${restaurantId},'Test bowl','For sender tests','Bowls',20000,'')`;
  raw = JSON.stringify(payload);
});
after(async () => {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM whatsapp_webhooks WHERE id=${hash(raw)}`;
    for (const table of [
      "payments",
      "bills",
      "message_jobs",
      "webhook_receipts",
      "order_events",
      "consent_records",
      "whatsapp_contacts",
      "customer_sessions",
    ])
      await tx.unsafe(`DELETE FROM ${table} WHERE restaurant_id=$1`, [
        restaurantId,
      ]);
    await tx`DELETE FROM orders WHERE restaurant_id=${restaurantId}`;
    await tx`DELETE FROM menu_items WHERE restaurant_id=${restaurantId}`;
    await tx`DELETE FROM restaurants WHERE id=${restaurantId}`;
  });
  for (const key of [
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_WABA_ID",
    "WHATSAPP_RESTAURANT_ID",
    "APP_URL",
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  await sql.end();
});
test("Meta handshake echoes the exact challenge; wrong or missing tokens fail", () => {
  const u = new URL(
    "https://test.example/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test&hub.challenge=001234",
  );
  assert.equal(verifyMetaChallenge(u, "test"), "001234");
  assert.throws(() => verifyMetaChallenge(u, "wrong"), /verification failed/);
  u.searchParams.delete("hub.challenge");
  assert.throws(() => verifyMetaChallenge(u, "test"), /verification failed/);
});
test("Meta HMAC is over raw bytes, without the custom callback timestamp", () => {
  const sig =
    "sha256=" +
    createHmac("sha256", "unit-test-secret").update(raw).digest("hex");
  assert.equal(validMetaSignature(raw, sig, "unit-test-secret"), true);
  assert.equal(validMetaSignature(raw + " ", sig, "unit-test-secret"), false);
  assert.equal(
    validMetaSignature(raw, "sha256=bad", "unit-test-secret"),
    false,
  );
});
test("signed events are persisted once, unsigned and tampered events rejected", async () => {
  const signature =
    "sha256=" +
    createHmac("sha256", "unit-test-secret").update(raw).digest("hex");
  const request = () =>
    new Request("https://test.example/api/webhooks/whatsapp", {
      method: "POST",
      body: raw,
      headers: { "x-hub-signature-256": signature },
    });
  assert.equal((await receiveMetaWebhook(request())).duplicate, false);
  assert.equal((await receiveMetaWebhook(request())).duplicate, true);
  await assert.rejects(
    () =>
      receiveMetaWebhook(
        new Request("https://test.example/api/webhooks/whatsapp", {
          method: "POST",
          body: raw,
        }),
      ),
    /Invalid Meta webhook signature/,
  );
});
test("incoming message replay queues one secure menu reply; wrong WABA is ignored", async () => {
  await processMetaPayload(payload);
  await processMetaPayload(payload);
  const jobs =
    await sql`SELECT * FROM message_jobs WHERE restaurant_id=${restaurantId}`;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].payload.provider, "meta");
  const sessions =
    await sql`SELECT * FROM customer_sessions WHERE restaurant_id=${restaurantId}`;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].customer_id, "wa:919999999999");
  await processMetaPayload({
    ...payload,
    entry: payload.entry.map((e) => ({ ...e, id: "other-waba" })),
  });
  assert.equal(
    (await sql`SELECT id FROM message_jobs WHERE restaurant_id=${restaurantId}`)
      .length,
    1,
  );
});
test("real sender builds a Meta API request, requires a live service window, and is never exercised against Meta in tests", async () => {
  const [job] =
    await sql`SELECT * FROM message_jobs WHERE restaurant_id=${restaurantId}`;
  let calls = 0;
  const fake = (async (url: unknown, init?: RequestInit) => {
    calls++;
    assert.match(String(url), /\/test-phone\/messages$/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.to, "919999999999");
    assert.match(body.text.body, /https:\/\/test.example\/menu\//);
    return Response.json({ messages: [{ id: "wamid.response-test" }] });
  }) as typeof fetch;
  const id = await deliverMetaMessage(
    job as {
      restaurant_id: string;
      kind: string;
      payload: Record<string, unknown>;
    },
    fake,
  );
  assert.equal(id, "wamid.response-test");
  assert.equal(calls, 1);
  await sql`UPDATE whatsapp_contacts SET last_message_at=now()-interval '25 hours' WHERE restaurant_id=${restaurantId}`;
  await assert.rejects(
    () =>
      deliverMetaMessage(
        job as {
          restaurant_id: string;
          kind: string;
          payload: Record<string, unknown>;
        },
        fake,
      ),
    /approved template/,
  );
  assert.equal(calls, 1);
});
test("delivery receipts never downgrade read messages to sent", async () => {
  const [job] =
    await sql`SELECT * FROM message_jobs WHERE restaurant_id=${restaurantId}`;
  await sql`UPDATE message_jobs SET provider_ref='wamid.delivery-test',status='read' WHERE id=${job.id}`;
  const statusPayload = (status: string) => ({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "test-waba",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "test-phone" },
              statuses: [
                {
                  id: "wamid.delivery-test",
                  status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                },
              ],
            },
          },
        ],
      },
    ],
  });
  await processMetaPayload(statusPayload("sent"));
  const [j] = await sql`SELECT status FROM message_jobs WHERE id=${job.id}`;
  assert.equal(j.status, "read");
});

test("Meta account-lock delivery failures keep their error code in the outbox", async () => {
  const [job] =
    await sql`SELECT * FROM message_jobs WHERE restaurant_id=${restaurantId}`;
  await sql`UPDATE message_jobs SET provider_ref='wamid.locked-test',status='submitted' WHERE id=${job.id}`;
  await processMetaPayload({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "test-waba",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "test-phone" },
              statuses: [
                {
                  id: "wamid.locked-test",
                  status: "failed",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  errors: [
                    {
                      code: 131031,
                      title: "Business Account locked",
                      error_data: {
                        details: "Business account has been locked.",
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const [result] =
    await sql`SELECT status,error FROM message_jobs WHERE id=${job.id}`;
  assert.equal(result.status, "failed");
  assert.match(result.error, /131031: Business Account locked/);
});

test("expired reply windows use only the matching approved Utility template", async () => {
  const order = await createOrder({
    version: 1,
    eventId: randomUUID(),
    restaurantId,
    customer: {
      id: "wa:919999999999",
      name: "Test Guest",
      phone: "+919999999999",
      verified: true,
    },
    items: [{ id: restaurantId + "-bowl", quantity: 1, optionIds: [] }],
    fulfillment: "pickup",
    paymentMethod: "cod",
  });
  await sql`UPDATE whatsapp_contacts SET last_message_at=now()-interval '25 hours' WHERE restaurant_id=${restaurantId}`;
  const job = {
    restaurant_id: restaurantId,
    order_id: order.id,
    kind: "accepted",
    payload: { estimate: 20 },
  };
  const sent: Record<string, unknown>[] = [];
  const fake = (async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      sent.push(JSON.parse(String(init.body)));
      return Response.json({ messages: [{ id: "wamid.approved-template" }] });
    }
    return Response.json({
      data: [
        {
          name: "eatfood_order_accepted_v1",
          language: "en_US",
          category: "UTILITY",
          status: "APPROVED",
        },
      ],
    });
  }) as typeof fetch;
  assert.equal(await deliverMetaMessage(job, fake), "wamid.approved-template");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "template");
  const body = sent[0] as {
    template: {
      name: string;
      components: { parameters: { text: string }[] }[];
    };
  };
  assert.equal(body.template.name, "eatfood_order_accepted_v1");
  assert.equal(body.template.components[0].parameters[2].text, "20 minutes");
  assert.match(
    body.template.components[0].parameters[3].text,
    /^https:\/\/test.example\/track\//,
  );
  for (const entry of [
    { status: "PENDING", category: "UTILITY", language: "en_US" },
    { status: "APPROVED", category: "MARKETING", language: "en_US" },
    { status: "APPROVED", category: "UTILITY", language: "en_GB" },
  ]) {
    let posts = 0;
    const unavailable = (async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") posts++;
      return Response.json({
        data: [{ name: "eatfood_order_accepted_v1", ...entry }],
      });
    }) as typeof fetch;
    await assert.rejects(
      () => deliverMetaMessage(job, unavailable),
      /not approved as Utility/,
    );
    assert.equal(posts, 0);
  }
  await sql`UPDATE whatsapp_contacts SET last_message_at=now() WHERE restaurant_id=${restaurantId}`;
  const textSent: Record<string, unknown>[] = [];
  const freeform = (async (_url: unknown, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    textSent.push(JSON.parse(String(init?.body)));
    return Response.json({ messages: [{ id: "wamid.freeform" }] });
  }) as typeof fetch;
  await deliverMetaMessage(job, freeform);
  assert.equal(textSent[0].type, "text");
  assert.match(
    (textSent[0].text as { body: string }).body,
    /https:\/\/test.example\/track\//,
  );
  await sql`UPDATE orders SET simulated_payment=true,payment_method='online' WHERE id=${order.id}`;
  await assert.rejects(
    () => deliverMetaMessage({ ...job, kind: "payment_received" }, freeform),
    /Simulated online payments cannot generate real/,
  );
});

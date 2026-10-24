import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, sql } from "./db";
import { calculate, nextStates, terminal } from "./domain";
import { menuItems } from "./schema";
import { AppError, hash, token } from "./security";
import type { MenuItem, Order, Settings, Staff } from "./types";
import { orderInput } from "./validation";
export async function catalog(restaurantId: string) {
  const [restaurant] =
    await sql`SELECT * FROM restaurants WHERE id=${restaurantId}`;
  if (!restaurant) throw new AppError(404, "Restaurant not found.");
  const menu = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.restaurantId, restaurantId))
    .orderBy(asc(menuItems.position));
  return { restaurant, menu: menu as MenuItem[] };
}
export async function createOrder(raw: unknown, source = "callback") {
  const input = orderInput.parse(raw);
  const payloadHash = hash(JSON.stringify(input));
  return await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${input.restaurantId + ":" + input.eventId}))`;
    const [receipt] =
      await tx`SELECT * FROM webhook_receipts WHERE restaurant_id=${input.restaurantId} AND event_id=${input.eventId}`;
    if (receipt) {
      if (receipt.payload_hash !== payloadHash)
        throw new AppError(
          409,
          "This event ID was already used for different order contents.",
        );
      return { ...receipt.response, duplicate: true };
    }
    const [restaurant] =
      await tx`SELECT * FROM restaurants WHERE id=${input.restaurantId} FOR SHARE`;
    if (!restaurant) throw new AppError(404, "Restaurant not found.");
    const menu =
      await tx`SELECT * FROM menu_items WHERE restaurant_id=${input.restaurantId} FOR SHARE`;
    const totals = calculate(
      input,
      menu as unknown as MenuItem[],
      restaurant.settings as Settings,
    );
    const id = randomUUID(),
      trackingToken = token(),
      ref =
        "EF-" +
        Date.now().toString(36).toUpperCase() +
        "-" +
        token().slice(0, 3).toUpperCase();
    await tx`INSERT INTO orders(id,restaurant_id,reference,source,customer_id,customer_name,phone,fulfillment,address,items,subtotal,tax,packaging,delivery_fee,total,payment_method,payment_status,simulated_payment,notes,tracking_hash) VALUES(${id},${input.restaurantId},${ref},${source},${input.customer.id},${input.customer.name},${input.customer.phone},${input.fulfillment},${JSON.stringify(input.address || null)}::jsonb,${JSON.stringify(totals.items)}::jsonb,${totals.subtotal},${totals.tax},${totals.packaging},${totals.deliveryFee},${totals.total},${input.paymentMethod},${input.paymentMethod === "online" ? "pending" : "unpaid"},${input.paymentMethod === "online"},${input.notes},${hash(trackingToken)})`;
    await tx`INSERT INTO order_events(id,restaurant_id,order_id,kind,actor,reason) VALUES(${randomUUID()},${input.restaurantId},${id},'awaiting',${source},'Order submitted; awaiting restaurant acceptance.')`;
    await tx`INSERT INTO message_jobs(id,restaurant_id,order_id,kind,payload) VALUES(${randomUUID()},${input.restaurantId},${id},'order_submitted',${JSON.stringify({ reference: ref, total: totals.total, trackingPath: "/track/" + trackingToken, simulated: true })}::jsonb)`;
    if (input.marketingConsent)
      await tx`INSERT INTO consent_records(id,restaurant_id,customer_id,purpose,source,granted) VALUES(${randomUUID()},${input.restaurantId},${input.customer.id},'promotions',${source},true)`;
    const response = {
      id,
      reference: ref,
      total: totals.total,
      trackingPath: "/track/" + trackingToken,
      status: "awaiting",
      paymentStatus: input.paymentMethod === "online" ? "pending" : "unpaid",
    };
    await tx`INSERT INTO webhook_receipts(restaurant_id,event_id,payload_hash,order_id,response) VALUES(${input.restaurantId},${input.eventId},${payloadHash},${id},${JSON.stringify(response)}::jsonb)`;
    return { ...response, duplicate: false };
  });
}
export async function getOrder(id: string, restaurantId: string) {
  const [o] =
    await sql`SELECT * FROM orders WHERE id=${id} AND restaurant_id=${restaurantId}`;
  if (!o) throw new AppError(404, "Order not found.");
  const events =
    await sql`SELECT * FROM order_events WHERE order_id=${id} AND restaurant_id=${restaurantId} ORDER BY created_at`;
  const messages =
    await sql`SELECT id,kind,status,attempts,error,created_at FROM message_jobs WHERE order_id=${id} AND restaurant_id=${restaurantId} ORDER BY created_at`;
  return { order: o as Order, events, messages };
}
export async function transition(
  id: string,
  staff: Staff,
  body: {
    status: string;
    version: number;
    reason?: string;
    estimate?: number;
    correction?: boolean;
  },
) {
  return sql.begin(async (tx) => {
    const [o] =
      await tx`SELECT * FROM orders WHERE id=${id} AND restaurant_id=${staff.restaurant_id} FOR UPDATE`;
    if (!o) throw new AppError(404, "Order not found.");
    if (o.version !== body.version)
      throw new AppError(409, "This order changed. Refresh and try again.");
    if (body.correction) {
      if (
        staff.role !== "owner" ||
        !terminal.includes(o.status) ||
        ![
          "accepted",
          "preparing",
          "ready",
          ...(o.fulfillment === "delivery" ? ["out_for_delivery"] : []),
        ].includes(body.status) ||
        !body.reason?.trim()
      )
        throw new AppError(
          422,
          "Owner corrections require a terminal order, a valid active state, and a reason.",
        );
    } else if (!nextStates(o.status, o.fulfillment).includes(body.status))
      throw new AppError(422, "This status change is not allowed.");
    if (
      ["rejected", "cancelled", "delivery_failed"].includes(body.status) &&
      !body.reason?.trim()
    )
      throw new AppError(422, "Please provide a reason.");
    if (
      body.status === "accepted" &&
      o.payment_method === "online" &&
      o.payment_status !== "paid"
    )
      throw new AppError(
        409,
        "Online payment must be verified before acceptance.",
      );
    if (
      body.status === "accepted" &&
      (!body.estimate || body.estimate < 1 || body.estimate > 180)
    )
      throw new AppError(
        422,
        "Set a preparation estimate between 1 and 180 minutes.",
      );
    const refund =
      ["rejected", "cancelled"].includes(body.status) &&
      o.payment_method === "online" &&
      o.payment_status === "paid";
    await tx`UPDATE orders SET status=${body.status},estimate=${body.estimate || o.estimate},version=version+1,updated_at=now(),payment_status=${refund ? "refund_pending" : o.payment_status},review_reason=${refund ? "Refund required after " + body.status : o.review_reason} WHERE id=${id}`;
    await tx`INSERT INTO order_events(id,restaurant_id,order_id,kind,actor,reason) VALUES(${randomUUID()},${staff.restaurant_id},${id},${body.status},${staff.name},${(body.correction ? "Owner correction: " : "") + (body.reason || "")})`;
    if (
      [
        "accepted",
        "rejected",
        "cancelled",
        "out_for_delivery",
        "delivered",
        "collected",
        "delivery_failed",
      ].includes(body.status) ||
      (body.status === "ready" && o.fulfillment === "pickup")
    )
      await tx`INSERT INTO message_jobs(id,restaurant_id,order_id,kind,payload) VALUES(${randomUUID()},${staff.restaurant_id},${id},${body.status},${JSON.stringify({ reference: o.reference, reason: body.reason, estimate: body.estimate, simulated: true })}::jsonb)`;
    return { ok: true };
  });
}
export async function paymentEvent(
  id: string,
  staff: Staff,
  body: {
    eventId: string;
    kind: "success" | "failed" | "refund" | "cod";
    amount: number;
    currency: string;
  },
) {
  return sql.begin(async (tx) => {
    const [o] =
      await tx`SELECT * FROM orders WHERE id=${id} AND restaurant_id=${staff.restaurant_id} FOR UPDATE`;
    if (!o) throw new AppError(404, "Order not found.");
    const [prev] =
      await tx`SELECT * FROM payments WHERE restaurant_id=${staff.restaurant_id} AND event_id=${body.eventId}`;
    if (prev) {
      if (
        prev.order_id !== id ||
        prev.kind !== body.kind ||
        prev.amount !== body.amount ||
        prev.currency !== body.currency
      )
        throw new AppError(409, "Payment event ID conflict.");
      return { ok: true, duplicate: true };
    }
    if (body.currency !== "INR" || body.amount !== o.total) {
      await tx`UPDATE orders SET review_reason='Payment amount or currency mismatch' WHERE id=${id}`;
      return { ok: false, review: true };
    }
    if (body.kind === "cod" && o.payment_method !== "cod")
      throw new AppError(422, "This is not a COD order.");
    if (body.kind !== "cod" && o.payment_method !== "online")
      throw new AppError(422, "This is not an online payment order.");
    if (body.kind === "cod" && ["rejected", "cancelled"].includes(o.status))
      throw new AppError(
        409,
        "Cannot collect COD on a rejected or cancelled order.",
      );
    if (
      body.kind === "refund" &&
      (staff.role !== "owner" || o.payment_status !== "refund_pending")
    )
      throw new AppError(
        422,
        "Owner confirmation and a pending refund are required.",
      );
    if (["cod", "success"].includes(body.kind) && o.payment_status === "paid")
      throw new AppError(409, "Payment was already recorded.");
    if (
      body.kind === "failed" &&
      ["paid", "refund_pending", "refunded"].includes(o.payment_status)
    )
      throw new AppError(
        409,
        "A failed notification cannot reverse a confirmed payment.",
      );
    if (
      body.kind === "success" &&
      ["refund_pending", "refunded"].includes(o.payment_status)
    )
      throw new AppError(
        409,
        "This payment already entered the refund process.",
      );
    const late =
      body.kind === "success" && ["rejected", "cancelled"].includes(o.status);
    const status =
      body.kind === "refund"
        ? "refunded"
        : body.kind === "failed"
          ? "failed"
          : late
            ? "refund_pending"
            : "paid";
    await tx`INSERT INTO payments(id,restaurant_id,order_id,event_id,kind,amount,currency,simulated) VALUES(${randomUUID()},${staff.restaurant_id},${id},${body.eventId},${body.kind},${body.amount},${body.currency},${body.kind !== "cod"})`;
    await tx`UPDATE orders SET payment_status=${status},review_reason=${late ? "Late payment after closure: refund review required" : body.kind === "refund" ? null : o.review_reason},updated_at=now(),version=version+1 WHERE id=${id}`;
    await tx`INSERT INTO order_events(id,restaurant_id,order_id,kind,actor,reason) VALUES(${randomUUID()},${staff.restaurant_id},${id},${"payment_" + status},${staff.name},${body.kind === "cod" ? "COD collection recorded" : "SIMULATED payment event: " + body.kind})`;
    if (body.kind === "cod")
      await tx`INSERT INTO message_jobs(id,restaurant_id,order_id,kind,payload) VALUES(${randomUUID()},${staff.restaurant_id},${id},'payment_received',${JSON.stringify({ amount: o.total, simulated: false })}::jsonb)`;
    return { ok: true };
  });
}
export async function issueBill(id: string, staff: Staff) {
  return sql.begin(async (tx) => {
    const [o] =
      await tx`SELECT * FROM orders WHERE id=${id} AND restaurant_id=${staff.restaurant_id} FOR UPDATE`;
    if (!o) throw new AppError(404, "Order not found.");
    const [existing] =
      await tx`SELECT * FROM bills WHERE order_id=${id} AND restaurant_id=${staff.restaurant_id}`;
    if (existing) return existing;
    const [r] =
      await tx`SELECT * FROM restaurants WHERE id=${staff.restaurant_id}`;
    const [n] = await tx`SELECT nextval('bill_number_seq') n`;
    const snapshot = {
      restaurant: {
        name: r.name,
        address: r.settings.address,
        billingDetails: r.settings.billingDetails,
      },
      order: o,
      issuedAt: new Date().toISOString(),
      demo: true,
    };
    const [bill] =
      await tx`INSERT INTO bills(id,restaurant_id,order_id,number,snapshot) VALUES(${randomUUID()},${staff.restaurant_id},${id},${"DEMO-" + String(n.n).padStart(6, "0")},${JSON.stringify(snapshot)}::jsonb) RETURNING *`;
    return bill;
  });
}
export async function createCustomerSession(
  restaurantId: string,
  customer: { id: string; name: string; phone: string },
) {
  const t = token();
  await sql`INSERT INTO customer_sessions(token_hash,restaurant_id,customer_id,name,phone,expires_at) VALUES(${hash(t)},${restaurantId},${customer.id},${customer.name},${customer.phone},now()+interval '30 minutes')`;
  return t;
}
export async function customerSession(t: string) {
  const [s] =
    await sql`SELECT * FROM customer_sessions WHERE token_hash=${hash(t)} AND expires_at>now()`;
  if (!s)
    throw new AppError(
      401,
      "Your menu link expired. Start a new conversation in the demo console.",
    );
  return s;
}

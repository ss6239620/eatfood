import { checkOrigin, rateLimit, requireStaff } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  catalog,
  createCustomerSession,
  createOrder,
  customerSession,
  getOrder,
  issueBill,
  paymentEvent,
  transition,
} from "@/lib/orders";
import {
  AppError,
  hash,
  passwordMatches,
  token,
  validSignature,
} from "@/lib/security";
import { settingsInput } from "@/lib/validation";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { receiveMetaWebhook, verifyMetaChallenge } from "@/lib/whatsapp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
async function handle(req: Request, context: Context) {
  try {
    const { path } = await context.params;
    const route = path.join("/"),
      method = req.method,
      url = new URL(req.url);
    if (method === "GET" && route === "health") {
      await sql`SELECT 1`;
      return json({ ok: true, mode: "local-demo" });
    }
    if (route === "webhooks/whatsapp") {
      if (method === "GET")
        return new Response(
          verifyMetaChallenge(url, process.env.WHATSAPP_VERIFY_TOKEN),
          {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        );
      if (method === "POST") return json(await receiveMetaWebhook(req));
      throw new AppError(405, "Method not allowed.");
    }
    if (method === "POST" && route === "integrations/whatsapp/orders") {
      const raw = await req.text();
      if (raw.length > 64000) throw new AppError(413, "Payload is too large.");
      const secret =
        process.env.WHATSAPP_ORDER_SECRET ||
        (process.env.NODE_ENV !== "production"
          ? "local-demo-change-before-sharing"
          : "");
      if (
        !secret ||
        !validSignature(
          raw,
          req.headers.get("x-eatfood-timestamp") || "",
          req.headers.get("x-eatfood-signature") || "",
          secret,
        )
      )
        throw new AppError(401, "Invalid or expired callback signature.");
      await rateLimit("callback:r_demo", 120);
      const body = JSON.parse(raw);
      if (body.restaurantId !== "r_demo")
        throw new AppError(
          403,
          "This integration key belongs to a different restaurant.",
        );
      const result = await createOrder(body);
      return json(result, result.duplicate ? 200 : 201);
    }
    if (method !== "GET") checkOrigin(req);
    if (method === "POST" && route === "auth/login") {
      await rateLimit(
        "login:" + hash(req.headers.get("x-forwarded-for") || "local"),
        15,
      );
      const body = z
        .object({
          email: z.string().email().max(200),
          password: z.string().min(1).max(200),
        })
        .parse(await req.json());
      const [u] =
        await sql`SELECT * FROM staff WHERE email=${body.email.toLowerCase()}`;
      if (!u || !passwordMatches(body.password, u.password_hash))
        throw new AppError(401, "Email or password is incorrect.");
      const t = token();
      await sql`INSERT INTO sessions(token_hash,staff_id,expires_at) VALUES(${hash(t)},${u.id},now()+interval '12 hours')`;
      (await cookies()).set("eatfood_session", t, {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(process.env.APP_URL || req.url).protocol === "https:",
        maxAge: 43200,
        path: "/",
      });
      return json({ ok: true });
    }
    if (method === "POST" && route === "auth/logout") {
      const t = (await cookies()).get("eatfood_session")?.value;
      if (t) await sql`DELETE FROM sessions WHERE token_hash=${hash(t)}`;
      (await cookies()).delete("eatfood_session");
      return json({ ok: true });
    }
    if (method === "GET" && route === "public/menu") {
      const slug = url.searchParams.get("slug") || "the-good-bowl";
      const [r] = await sql`SELECT id FROM restaurants WHERE slug=${slug}`;
      if (!r) throw new AppError(404, "Restaurant not found.");
      return json(await catalog(r.id));
    }
    if (method === "GET" && route === "customer/session") {
      const s = await customerSession(url.searchParams.get("token") || "");
      return json({
        name: s.name,
        phone: s.phone,
        restaurantId: s.restaurant_id,
      });
    }
    if (method === "POST" && route === "customer/orders") {
      const body = await req.json();
      const s = await customerSession(String(body.sessionToken || ""));
      await rateLimit("checkout:" + s.token_hash, 15);
      return json(
        await createOrder(
          {
            ...body,
            version: 1,
            restaurantId: s.restaurant_id,
            customer: {
              id: s.customer_id,
              name: s.name,
              phone: s.phone,
              verified: true,
            },
          },
          "web_checkout",
        ),
        201,
      );
    }
    if (method === "GET" && route === "public/tracking") {
      const [o] =
        await sql`SELECT id,reference,restaurant_id,status,items,total,subtotal,tax,packaging,delivery_fee,fulfillment,payment_method,payment_status,simulated_payment,estimate,created_at,updated_at FROM orders WHERE tracking_hash=${hash(url.searchParams.get("token") || "")}`;
      if (!o) throw new AppError(404, "Tracking link not found.");
      const [r] =
        await sql`SELECT name,settings->>'phone' phone FROM restaurants WHERE id=${o.restaurant_id}`;
      const events =
        await sql`SELECT kind,reason,created_at FROM order_events WHERE order_id=${o.id} ORDER BY created_at`;
      return json({ order: o, restaurant: r, events });
    }
    const staff = await requireStaff();
    if (method === "GET" && route === "whatsapp/status") {
      await requireStaff(true);
      if (
        staff.restaurant_id !== (process.env.WHATSAPP_RESTAURANT_ID || "r_demo")
      )
        throw new AppError(
          403,
          "This WhatsApp connection belongs to another restaurant.",
        );
      const events =
        await sql`SELECT id,status,attempts,error,created_at FROM whatsapp_webhooks ORDER BY created_at DESC LIMIT 20`;
      return json({
        verificationConfigured: !!process.env.WHATSAPP_VERIFY_TOKEN,
        signatureConfigured: !!process.env.WHATSAPP_APP_SECRET,
        senderConfigured: !!(
          process.env.WHATSAPP_ACCESS_TOKEN &&
          process.env.WHATSAPP_PHONE_NUMBER_ID &&
          process.env.WHATSAPP_WABA_ID
        ),
        events,
      });
    }
    if (method === "GET" && route === "dashboard") {
      const { restaurant, menu } = await catalog(staff.restaurant_id);
      const orders =
        await sql`SELECT * FROM orders WHERE restaurant_id=${staff.restaurant_id} ORDER BY created_at DESC LIMIT 500`;
      const jobs =
        await sql`SELECT id,order_id,kind,status,attempts,error,created_at FROM message_jobs WHERE restaurant_id=${staff.restaurant_id} ORDER BY created_at DESC LIMIT 100`;
      const [summary] =
        await sql`SELECT count(*)::int orders,coalesce(sum(total) FILTER(WHERE status IN ('delivered','collected')),0)::int completed_value,coalesce(sum(total) FILTER(WHERE payment_status IN ('unpaid','pending','failed') AND status NOT IN ('rejected','cancelled')),0)::int unpaid FROM orders WHERE restaurant_id=${staff.restaurant_id} AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date`;
      const [payments] =
        await sql`SELECT coalesce(sum(amount) FILTER(WHERE kind='cod' AND NOT simulated),0)::int cod_collected,coalesce(sum(amount) FILTER(WHERE kind='success' AND simulated),0)::int simulated_online,coalesce(sum(amount) FILTER(WHERE kind='success' AND NOT simulated),0)::int verified_online,coalesce(sum(amount) FILTER(WHERE kind='refund'),0)::int refunds FROM payments WHERE restaurant_id=${staff.restaurant_id} AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date`;
      return json({
        staff,
        restaurant,
        menu,
        orders,
        jobs,
        summary: { ...summary, ...payments },
        syncedAt: new Date().toISOString(),
      });
    }
    if (path[0] === "orders" && path[1]) {
      const id = path[1];
      if (method === "GET" && path.length === 2)
        return json(await getOrder(id, staff.restaurant_id));
      if (method === "POST" && path[2] === "transition") {
        const body = z
          .object({
            status: z.string(),
            version: z.number().int(),
            reason: z.string().max(500).optional(),
            estimate: z.number().int().optional(),
            correction: z.boolean().optional(),
          })
          .parse(await req.json());
        return json(await transition(id, staff, body));
      }
      if (method === "POST" && path[2] === "payment") {
        const body = z
          .object({
            eventId: z.string().min(8).max(120),
            kind: z.enum(["success", "failed", "refund", "cod"]),
            amount: z.number().int().nonnegative(),
            currency: z.string().max(10),
          })
          .parse(await req.json());
        if (body.kind !== "cod" && process.env.DEMO_MODE !== "true")
          throw new AppError(403, "Payment simulator is disabled.");
        return json(await paymentEvent(id, staff, body));
      }
      if (method === "POST" && path[2] === "review") {
        await requireStaff(true);
        const { reason } = z
          .object({ reason: z.string().trim().min(3).max(500) })
          .parse(await req.json());
        await sql.begin(async (tx) => {
          const [order] =
            await tx`SELECT * FROM orders WHERE id=${id} AND restaurant_id=${staff.restaurant_id} FOR UPDATE`;
          if (!order) throw new AppError(404, "Order not found.");
          if (order.payment_status === "refund_pending")
            throw new AppError(
              409,
              "Confirm the refund before resolving this review.",
            );
          if (!order.review_reason)
            throw new AppError(409, "This order has no pending review.");
          await tx`UPDATE orders SET review_reason=NULL,version=version+1,updated_at=now() WHERE id=${id}`;
          await tx`INSERT INTO order_events(id,restaurant_id,order_id,kind,actor,reason) VALUES(${randomUUID()},${staff.restaurant_id},${id},'review_resolved',${staff.name},${reason})`;
        });
        return json({ ok: true });
      }
      if (method === "POST" && path[2] === "bill")
        return json(await issueBill(id, staff));
    }
    if (method === "PATCH" && path[0] === "menu" && path[1]) {
      await requireStaff(true);
      const body = z
        .object({
          available: z.boolean().optional(),
          price: z.number().int().min(0).max(10000000).optional(),
          name: z.string().min(1).max(100).optional(),
          description: z.string().max(500).optional(),
        })
        .parse(await req.json());
      const [item] =
        await sql`SELECT * FROM menu_items WHERE id=${path[1]} AND restaurant_id=${staff.restaurant_id}`;
      if (!item) throw new AppError(404, "Menu item not found.");
      await sql.begin(async (tx) => {
        await tx`UPDATE menu_items SET available=${body.available ?? item.available},price=${body.price ?? item.price},name=${body.name ?? item.name},description=${body.description ?? item.description} WHERE id=${item.id} AND restaurant_id=${staff.restaurant_id}`;
        await tx`INSERT INTO audit_events(id,restaurant_id,actor,action,details) VALUES(${randomUUID()},${staff.restaurant_id},${staff.id},'menu_updated',${JSON.stringify({ id: item.id, ...body })}::jsonb)`;
      });
      return json({ ok: true });
    }
    if (method === "PATCH" && route === "settings") {
      await requireStaff(true);
      const body = settingsInput.parse(await req.json());
      await sql.begin(async (tx) => {
        await tx`UPDATE restaurants SET settings=${JSON.stringify(body)}::jsonb WHERE id=${staff.restaurant_id}`;
        await tx`INSERT INTO audit_events(id,restaurant_id,actor,action,details) VALUES(${randomUUID()},${staff.restaurant_id},${staff.id},'settings_updated',${JSON.stringify(body)}::jsonb)`;
      });
      return json({ ok: true });
    }
    if (method === "GET" && route === "staff") {
      await requireStaff(true);
      return json(
        await sql`SELECT id,name,email,role FROM staff WHERE restaurant_id=${staff.restaurant_id}`,
      );
    }
    if (method === "POST" && route === "demo/start") {
      if (process.env.DEMO_MODE !== "true")
        throw new AppError(403, "Demo mode is disabled.");
      const s = await createCustomerSession(staff.restaurant_id, {
        id: "demo-diner",
        name: "Alex Morgan",
        phone: "+919876543210",
      });
      const [r] =
        await sql`SELECT slug FROM restaurants WHERE id=${staff.restaurant_id}`;
      const menuPath = "/menu/" + r.slug + "?session=" + s;
      await sql`INSERT INTO message_jobs(id,restaurant_id,kind,payload) VALUES(${randomUUID()},${staff.restaurant_id},'menu_link',${JSON.stringify({ menuPath, simulated: true })}::jsonb)`;
      return json({ menuPath, simulated: true });
    }
    if (method === "POST" && route === "demo/callback") {
      if (process.env.DEMO_MODE !== "true")
        throw new AppError(403, "Demo mode is disabled.");
      const body = await req.json();
      const result = await createOrder(
        { ...body, restaurantId: staff.restaurant_id },
        "callback_simulator",
      );
      return json(result);
    }
    if (method === "POST" && route === "demo/message-failure") {
      if (process.env.DEMO_MODE !== "true")
        throw new AppError(403, "Demo mode is disabled.");
      await sql`INSERT INTO message_jobs(id,restaurant_id,kind,payload) VALUES(${randomUUID()},${staff.restaurant_id},'demo_failure','{"forceFailure":true,"simulated":true}'::jsonb)`;
      return json({ ok: true });
    }
    if (method === "POST" && path[0] === "messages" && path[2] === "retry") {
      const result =
        await sql`UPDATE message_jobs SET status='queued',attempts=0,available_at=now(),error=NULL,payload=payload-'forceFailure' WHERE id=${path[1]} AND restaurant_id=${staff.restaurant_id} AND status='failed' RETURNING id`;
      if (!result.length)
        throw new AppError(409, "Only failed messages can be retried.");
      return json({ ok: true });
    }
    throw new AppError(404, "Endpoint not found.");
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return json(
        {
          error: e.issues
            .map((x) => x.path.join(".") + ": " + x.message)
            .join("; "),
        },
        422,
      );
    if (e instanceof SyntaxError) return json({ error: "Invalid JSON." }, 400);
    console.error("Request failed", e instanceof Error ? e.name : "unknown");
    return json(
      { error: "The request could not be completed. Please retry." },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;

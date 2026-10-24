import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "./db";
import { AppError, hash, token } from "./security";
import type { Order } from "./types";
import { orderTemplateValues } from "./whatsapp-order-message";
import { templateParameters, renderTemplate } from "./whatsapp-templates";
const envelope = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z
    .array(
      z.object({
        id: z.string(),
        changes: z
          .array(
            z.object({
              field: z.string(),
              value: z.record(z.string(), z.unknown()),
            }),
          )
          .max(100),
      }),
    )
    .max(100),
});
export function validMetaSignature(
  raw: string,
  signature: string,
  secret: string,
) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
export function verifyMetaChallenge(url: URL, expected: string | undefined) {
  const challenge = url.searchParams.get("hub.challenge");
  if (
    !expected ||
    url.searchParams.get("hub.mode") !== "subscribe" ||
    url.searchParams.get("hub.verify_token") !== expected ||
    !challenge ||
    challenge.length > 1000
  )
    throw new AppError(403, "Webhook verification failed.");
  return challenge;
}
export async function receiveMetaWebhook(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret)
    throw new AppError(
      503,
      "Configure WHATSAPP_APP_SECRET before receiving real Meta events.",
    );
  if (Number(req.headers.get("content-length") || 0) > 1_000_000)
    throw new AppError(413, "Webhook payload is too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new AppError(400, "Webhook body is missing.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_000_000) {
      await reader.cancel();
      throw new AppError(413, "Webhook payload is too large.");
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (
    !validMetaSignature(
      raw,
      req.headers.get("x-hub-signature-256") || "",
      secret,
    )
  )
    throw new AppError(401, "Invalid Meta webhook signature.");
  const body = envelope.parse(JSON.parse(raw));
  // Persist before acknowledgement. Worker retries independently of Meta delivery.
  const result =
    await sql`INSERT INTO whatsapp_webhooks(id,payload) VALUES(${hash(raw)},${JSON.stringify(body)}::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id`;
  return { received: true, duplicate: result.length === 0 };
}
const message = z.object({
  id: z.string().min(1).max(300),
  from: z.string().regex(/^\d{7,15}$/),
  timestamp: z.string().regex(/^\d+$/),
  type: z.string(),
});
export function metaFailureSummary(error: { code?: number } | undefined) {
  if (error?.code === 131031)
    return "Meta error 131031: Business Account locked. Check Meta Business Info, verification, and billing.";
  if (error?.code !== undefined)
    return `Meta error ${error.code}: request or message delivery failed. Check Meta account diagnostics.`;
  return "Meta reported message delivery failure.";
}
const statuses = ["sent", "delivered", "read", "failed"] as const;
export async function processMetaPayload(raw: unknown) {
  const body = envelope.parse(raw),
    phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID,
    waba = process.env.WHATSAPP_WABA_ID,
    restaurantId = process.env.WHATSAPP_RESTAURANT_ID || "r_demo";
  for (const entry of body.entry) {
    if (!waba || !phoneId)
      throw new AppError(
        503,
        "Set WHATSAPP_WABA_ID and WHATSAPP_PHONE_NUMBER_ID to route received events.",
      );
    if (entry.id !== waba) continue;
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const metadata = value.metadata as
        | { phone_number_id?: string }
        | undefined;
      if (metadata?.phone_number_id !== phoneId) continue;
      const contacts = z
        .array(
          z.object({
            wa_id: z.string(),
            profile: z.object({ name: z.string() }).optional(),
          }),
        )
        .catch([])
        .parse(value.contacts);
      const updates = z
        .array(
          z.object({
            id: z.string(),
            status: z.enum(statuses),
            timestamp: z.string(),
            errors: z.array(z.object({ code: z.number().int() })).optional(),
          }),
        )
        .catch([])
        .parse(value.statuses);
      for (const update of updates) {
        // A late 'sent' notification must not downgrade delivered/read.
        const mapped = update.status === "sent" ? "submitted" : update.status;
        await sql`UPDATE message_jobs SET status=${mapped},error=${mapped === "failed" ? metaFailureSummary(update.errors?.[0]) : null} WHERE restaurant_id=${restaurantId} AND provider_ref=${update.id} AND payload->>'provider'='meta' AND ((${mapped}='submitted' AND status NOT IN ('delivered','read','failed')) OR (${mapped}='delivered' AND status NOT IN ('read','failed')) OR ${mapped} IN ('read','failed'))`;
      }
      const inbound = z.array(message).catch([]).parse(value.messages);
      for (const m of inbound) {
        if (m.type === "system") continue;
        const sentAt = new Date(Number(m.timestamp) * 1000);
        if (!Number.isFinite(sentAt.getTime())) continue;
        const name =
          contacts
            .find((c) => c.wa_id === m.from)
            ?.profile?.name?.slice(0, 100) || "Guest";
        await sql.begin(async (tx) => {
          const key = "meta-message:" + m.id;
          await tx`SELECT pg_advisory_xact_lock(hashtext(${restaurantId + key}))`;
          const [exists] =
            await tx`SELECT event_id FROM webhook_receipts WHERE restaurant_id=${restaurantId} AND event_id=${key}`;
          if (exists) return;
          await tx`INSERT INTO whatsapp_contacts(restaurant_id,wa_id,name,phone_number_id,last_message_at) VALUES(${restaurantId},${m.from},${name},${phoneId},${sentAt.toISOString()}::timestamptz) ON CONFLICT(restaurant_id,wa_id) DO UPDATE SET name=EXCLUDED.name,phone_number_id=EXCLUDED.phone_number_id,last_message_at=greatest(whatsapp_contacts.last_message_at,EXCLUDED.last_message_at)`;
          // Do not reply to delayed events after the 24-hour service window.
          if (Date.now() - sentAt.getTime() < 24 * 60 * 60 * 1000) {
            const [r] =
              await tx`SELECT name,slug FROM restaurants WHERE id=${restaurantId}`;
            if (!r)
              throw new AppError(404, "WhatsApp restaurant mapping not found.");
            const session = token();
            const menuPath = "/menu/" + r.slug + "?session=" + session;
            await tx`INSERT INTO customer_sessions(token_hash,restaurant_id,customer_id,name,phone,expires_at) VALUES(${hash(session)},${restaurantId},${"wa:" + m.from},${name},${"+" + m.from},now()+interval '30 minutes')`;
            await tx`INSERT INTO message_jobs(id,restaurant_id,kind,payload) VALUES(${randomUUID()},${restaurantId},'menu_link',${JSON.stringify({ provider: "meta", to: m.from, phoneNumberId: phoneId, text: `Hi ${name}! Welcome to ${r.name}. Browse our menu and place your order: ${menuPath}`, menuPath })}::jsonb)`;
          }
          await tx`INSERT INTO webhook_receipts(restaurant_id,event_id,payload_hash,response) VALUES(${restaurantId},${key},${hash(m.id)},'{"received":true}'::jsonb)`;
        });
      }
    }
  }
}
export async function tickMetaWebhooks() {
  const rows = await sql.begin(async (tx) => {
    await tx`UPDATE whatsapp_webhooks SET status=CASE WHEN attempts>=8 THEN 'failed' ELSE 'queued' END,locked_at=NULL WHERE status='processing' AND locked_at<now()-interval '60 seconds'`;
    return tx`UPDATE whatsapp_webhooks SET status='processing',attempts=attempts+1,locked_at=now() WHERE id IN (SELECT id FROM whatsapp_webhooks WHERE status='queued' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING *`;
  });
  for (const row of rows) {
    try {
      await processMetaPayload(row.payload);
      await sql`UPDATE whatsapp_webhooks SET status='processed',locked_at=NULL,error=NULL WHERE id=${row.id}`;
    } catch (e) {
      const configError = e instanceof AppError && e.status === 503;
      await sql`UPDATE whatsapp_webhooks SET status=${configError || row.attempts < 8 ? "queued" : "failed"},attempts=${configError ? 0 : row.attempts},available_at=now()+${configError ? 30 : Math.min(300, 2 ** row.attempts)}*interval '1 second',locked_at=NULL,error=${configError ? "WhatsApp routing credentials are not configured" : "Webhook processing failed; retry scheduled"} WHERE id=${row.id}`;
    }
  }
}
export async function deliverMetaMessage(
  job: {
    restaurant_id: string;
    order_id?: string;
    kind: string;
    payload: Record<string, unknown>;
  },
  fetcher: typeof fetch = fetch,
) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN,
    phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneId)
    throw new AppError(503, "WhatsApp sender credentials are not configured.");
  let to = String(job.payload.to || ""),
    text = String(job.payload.text || "");
  let template: ReturnType<typeof templateParameters> = null;
  const appUrl = new URL(process.env.APP_URL || "http://localhost:3080");
  if (appUrl.protocol !== "https:")
    throw new AppError(
      503,
      "Configure a public HTTPS APP_URL before sending customer links.",
    );
  if (job.order_id) {
    const [o] =
      await sql`SELECT * FROM orders WHERE id=${job.order_id} AND restaurant_id=${job.restaurant_id}`;
    if (!o) throw new AppError(404, "Order not found.");
    to = o.phone.replace(/^\+/, "");
    text = `Order ${o.reference}: ${job.kind.replaceAll("_", " ")}. ${o.estimate ? "Estimated preparation: " + o.estimate + " minutes. " : ""}${String(job.payload.reason || "")}`;
    if (job.payload.trackingPath)
      text += " Track: " + String(job.payload.trackingPath);
    const [restaurant] =
      await sql`SELECT settings FROM restaurants WHERE id=${job.restaurant_id}`;
    const [receipt] =
      await sql`SELECT response->>'trackingPath' AS path FROM webhook_receipts WHERE order_id=${job.order_id} AND restaurant_id=${job.restaurant_id} AND response ? 'trackingPath' ORDER BY created_at LIMIT 1`;
    const path = String(job.payload.trackingPath || receipt?.path || "");
    const tracking = path ? new URL(path, appUrl).href : "";
    const values = orderTemplateValues(
      o as Order,
      job.kind,
      job.payload,
      restaurant?.settings.address || "the restaurant",
      tracking,
    );
    if (
      [
        "payment_received",
        "payment_failed",
        "refund_pending",
        "refunded",
      ].includes(job.kind) &&
      o.simulated_payment
    )
      throw new AppError(
        422,
        "Simulated online payments cannot generate real payment or refund confirmations.",
      );
    try {
      template = templateParameters(job.kind, values);
      text = renderTemplate(job.kind, values) || text;
    } catch {
      throw new AppError(
        422,
        "An order notification is missing a required template parameter.",
      );
    }
  }
  if (!/^\d{7,15}$/.test(to))
    throw new AppError(422, "Invalid WhatsApp recipient.");
  const [contact] =
    await sql`SELECT last_message_at FROM whatsapp_contacts WHERE restaurant_id=${job.restaurant_id} AND wa_id=${to} AND phone_number_id=${phoneId}`;
  if (!contact)
    throw new AppError(
      409,
      "A verified WhatsApp customer contact is required.",
    );
  const outsideWindow =
    Date.now() - new Date(contact.last_message_at).getTime() >=
    24 * 60 * 60 * 1000;
  let messageBody: Record<string, unknown>;
  if (outsideWindow) {
    if (!template)
      throw new AppError(
        409,
        "An approved template is required outside the customer-service window.",
      );
    const query = new URLSearchParams({
      name: template.definition.name,
      fields: "name,status,language,category",
      limit: "100",
    });
    const approvedResponse = await fetcher(
      `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v25.0"}/${process.env.WHATSAPP_WABA_ID}/message_templates?${query}`,
      {
        headers: { Authorization: "Bearer " + accessToken },
        signal: AbortSignal.timeout(10000),
      },
    );
    const templates = await approvedResponse.json();
    if (!approvedResponse.ok)
      throw new AppError(
        approvedResponse.status >= 500 ? 502 : 422,
        metaFailureSummary(templates.error),
      );
    const approved = templates.data?.some(
      (t: {
        name: string;
        language: string;
        status: string;
        category: string;
      }) =>
        t.name === template!.definition.name &&
        t.language === template!.definition.language &&
        t.status === "APPROVED" &&
        t.category === "UTILITY",
    );
    if (!approved)
      throw new AppError(
        409,
        `Template ${template.definition.name} is not approved as Utility yet. Retry after approval.`,
      );
    messageBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: template.definition.name,
        language: { code: template.definition.language },
        components: [{ type: "body", parameters: template.parameters }],
      },
    };
  } else {
    // Template renderings already contain absolute tracking URLs; only menu replies need expansion.
    if (!job.order_id && job.payload.menuPath)
      text = String(job.payload.text || "").replace(
        String(job.payload.menuPath),
        new URL(String(job.payload.menuPath), appUrl).href,
      );
    messageBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    };
  }
  const response = await fetcher(
    `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v25.0"}/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageBody),
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await response.json();
  if (!response.ok || !data.messages?.[0]?.id)
    throw new AppError(
      response.status >= 500 ? 502 : 422,
      metaFailureSummary(data.error),
    );
  return String(data.messages[0].id);
}

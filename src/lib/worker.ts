import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { AppError } from "./errors";
import { deliverMetaMessage, tickMetaWebhooks } from "./whatsapp";
export async function tick() {
  await tickMetaWebhooks();
  // Claim under row locks; expired leases are recovered after worker crashes.
  const jobs = await sql.begin(async (tx) => {
    await tx`UPDATE message_jobs SET status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'queued' END,locked_at=NULL,error='Worker lease expired' WHERE status='processing' AND locked_at<now()-interval '60 seconds'`;
    return tx`UPDATE message_jobs SET status='processing',locked_at=now(),attempts=attempts+1 WHERE id IN (SELECT id FROM message_jobs WHERE status='queued' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20) RETURNING *`;
  });
  // Run the bounded batch in parallel so network timeouts cannot outlive a job lease.
  await Promise.all(
    jobs.map(async (job) => {
      try {
        if (job.payload.forceFailure)
          throw new Error("Simulated provider unavailable");
        let useMeta = job.payload.provider === "meta";
        if (job.order_id && !useMeta) {
          const [o] =
            await sql`SELECT customer_id FROM orders WHERE id=${job.order_id} AND restaurant_id=${job.restaurant_id}`;
          useMeta = String(o?.customer_id || "").startsWith("wa:");
        }
        if (useMeta) {
          const reference = await deliverMetaMessage(
            job as {
              restaurant_id: string;
              order_id?: string;
              kind: string;
              payload: Record<string, unknown>;
            },
          );
          await sql`UPDATE message_jobs SET status='submitted',provider_ref=${reference},payload=payload||'{"provider":"meta"}'::jsonb,locked_at=NULL,error=NULL WHERE id=${job.id}`;
        } else {
          await sql`UPDATE message_jobs SET status='simulated',provider_ref=${"sim-" + job.id},locked_at=NULL,error=NULL WHERE id=${job.id}`;
        }
      } catch (e) {
        const missing = e instanceof AppError && e.status === 503;
        const permanent =
          e instanceof AppError && [409, 422].includes(e.status);
        await sql`UPDATE message_jobs SET status=${permanent || (!missing && job.attempts >= 4) ? "failed" : "queued"},attempts=${missing ? 0 : job.attempts},error=${e instanceof AppError ? e.message : "Message provider unavailable"},available_at=now()+${missing ? 30 : Math.min(60, 2 ** job.attempts)}*interval '1 second',locked_at=NULL WHERE id=${job.id}`;
      }
    }),
  );
  await sql.begin(async (tx) => {
    const stale =
      await tx`SELECT o.*,r.settings FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.status='awaiting' AND o.created_at<now()-((r.settings->>'timeoutMinutes')::int*interval '1 minute') FOR UPDATE OF o SKIP LOCKED`;
    for (const o of stale) {
      const paid = o.payment_method === "online" && o.payment_status === "paid";
      await tx`UPDATE orders SET status='rejected',payment_status=${paid ? "refund_pending" : o.payment_status},review_reason=${paid ? "Automatic timeout: refund required" : null},version=version+1,updated_at=now() WHERE id=${o.id}`;
      await tx`INSERT INTO order_events(id,restaurant_id,order_id,kind,actor,reason) VALUES(${randomUUID()},${o.restaurant_id},${o.id},'rejected','system','Restaurant acceptance timed out.')`;
      await tx`INSERT INTO message_jobs(id,restaurant_id,order_id,kind,payload) VALUES(${randomUUID()},${o.restaurant_id},${o.id},'rejected','{"reason":"Restaurant acceptance timed out","simulated":true}'::jsonb)`;
    }
  });
  await sql`DELETE FROM sessions WHERE expires_at<now()`;
  await sql`DELETE FROM customer_sessions WHERE expires_at<now()`;
  await sql`DELETE FROM rate_limits WHERE expires_at<now()-interval '1 hour'`;
  return jobs.length;
}

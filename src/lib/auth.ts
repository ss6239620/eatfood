import { cookies } from "next/headers";
import { sql } from "./db";
import { AppError, hash } from "./security";
import type { Staff } from "./types";
export async function requireStaff(owner = false): Promise<Staff> {
  const t = (await cookies()).get("eatfood_session")?.value;
  if (!t) throw new AppError(401, "Please sign in.");
  const [u] =
    await sql`SELECT s.id,s.restaurant_id,s.name,s.email,s.role FROM sessions x JOIN staff s ON s.id=x.staff_id WHERE x.token_hash=${hash(t)} AND x.expires_at>now()`;
  if (!u) throw new AppError(401, "Your session has expired. Please sign in.");
  if (owner && u.role !== "owner")
    throw new AppError(403, "Only the owner can make this change.");
  return u as Staff;
}
export async function rateLimit(key: string, max = 30) {
  const [r] =
    await sql`INSERT INTO rate_limits(key,count,expires_at) VALUES(${key},1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '1 minute' ELSE rate_limits.expires_at END RETURNING count`;
  if (r.count > max)
    throw new AppError(429, "Too many requests. Try again in a minute.");
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const forwarded = req.headers.get("x-forwarded-host");
  const host = req.headers.get("host");
  if (
    origin &&
    new URL(origin).host !== host &&
    new URL(origin).host !== forwarded
  )
    throw new AppError(403, "Cross-origin request rejected.");
}

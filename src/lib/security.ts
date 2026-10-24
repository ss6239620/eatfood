import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export const token = () => randomBytes(32).toString("base64url");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function passwordMatches(password: string, stored: string) {
  const [salt, h] = stored.split(":");
  const a = Buffer.from(h, "hex");
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function sign(body: string, timestamp: string, secret: string) {
  return createHmac("sha256", secret)
    .update(timestamp + "." + body)
    .digest("hex");
}
export function validSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 300_000
  )
    return false;
  const a = Buffer.from(signature.replace(/^sha256=/, ""), "hex"),
    b = Buffer.from(sign(body, timestamp, secret), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export { AppError } from "./errors";

import { sql } from "../src/lib/db";
import { tick } from "../src/lib/worker";
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
console.log(
  "EatFood worker started (Meta replies for verified WhatsApp contacts; simulator for demo contacts).",
);
while (running) {
  try {
    await tick();
  } catch {
    console.error("Worker cycle failed; retrying.");
  }
  await new Promise((r) => setTimeout(r, 2000));
}
await sql.end();

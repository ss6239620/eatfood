import { readFileSync, readdirSync } from "node:fs";
import { sql } from "../src/lib/db";
await sql`CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`;
for (const name of readdirSync("migrations")
  .filter((x) => x.endsWith(".sql"))
  .sort()) {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(823402)`;
    const exists =
      await tx`SELECT name FROM schema_migrations WHERE name=${name}`;
    if (!exists.length) {
      await tx.unsafe(readFileSync("migrations/" + name, "utf8"));
      await tx`INSERT INTO schema_migrations(name) VALUES(${name})`;
      console.log("Applied", name);
    }
  });
}
await sql.end();

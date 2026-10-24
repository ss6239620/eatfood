import { drizzle } from "drizzle-orm/postgres-js";
import { existsSync } from "node:fs";
import postgres from "postgres";
import * as schema from "./schema";
if (existsSync(".env")) process.loadEnvFile(".env");
const globalDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };
export const sql =
  globalDb.sql ??
  postgres(
    process.env.DATABASE_URL ||
      "postgres://eatfood:eatfood_local@localhost:54329/eatfood",
    { max: 10, onnotice: () => {} },
  );
if (process.env.NODE_ENV !== "production") globalDb.sql = sql;
export const db = drizzle(sql, { schema });

import { execFileSync } from "node:child_process";
execFileSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"],
  { stdio: "inherit" },
);
execFileSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "scripts/seed.ts"],
  { stdio: "inherit" },
);

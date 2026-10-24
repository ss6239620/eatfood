import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
const cache = homedir() + "/.cache/ms-playwright";
const cached = existsSync(cache)
  ? readdirSync(cache)
      .filter((n) => n.startsWith("chromium-"))
      .sort()
      .reverse()
      .map((n) => cache + "/" + n + "/chrome-linux64/chrome")
      .find(existsSync)
  : undefined;
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:3080",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || cached,
    },
    screenshot: "only-on-failure",
  },
  reporter: "list",
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import {
  allowedPublicRoute,
  createGateway,
} from "../scripts/webhook-gateway.mjs";
let server: ReturnType<typeof createGateway>, port: number;
before(async () => {
  server = createGateway(1);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err: Error | undefined) => (err ? reject(err) : resolve())),
  );
});
test("public gateway admits webhook/customer paths and blocks staff/admin/demo routes", () => {
  assert.equal(allowedPublicRoute("/api/webhooks/whatsapp", "POST"), true);
  assert.equal(allowedPublicRoute("/api/customer/orders", "POST"), true);
  for (const path of [
    "/",
    "/login",
    "/api/auth/login",
    "/api/dashboard",
    "/api/demo/start",
    "/api/integrations/whatsapp/orders",
    "/print/test",
  ])
    assert.equal(allowedPublicRoute(path, "POST"), false);
});
test("traversal and unsupported methods cannot reach staff routes", async () => {
  for (const path of [
    "/api/dashboard",
    "/menu/%2e%2e/api/dashboard",
    "/menu/%252e%252e/api/dashboard",
    "/menu/a%5c..%5capi%5cdashboard",
  ]) {
    const response = await fetch("http://127.0.0.1:" + port + path);
    assert.equal(response.status, 404);
  }
  const response = await fetch(
    "http://127.0.0.1:" + port + "/api/webhooks/whatsapp",
    { method: "DELETE" },
  );
  assert.equal(response.status, 404);
});

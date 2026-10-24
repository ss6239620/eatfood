import assert from "node:assert/strict";
import { test } from "node:test";
import { calculate, nextStates } from "../src/lib/domain";
import { sign, validSignature } from "../src/lib/security";
import type { MenuItem, Settings } from "../src/lib/types";
import { orderInput } from "../src/lib/validation";
const settings: Settings = {
  open: true,
  address: "Test address",
  phone: "+919876543210",
  deliveryAreas: ["Indiranagar"],
  deliveryFee: 3000,
  packagingFee: 1000,
  minimumOrder: 10000,
  taxBps: 500,
  opensAt: "00:00",
  closesAt: "00:00",
  alertMinutes: 2,
  timeoutMinutes: 10,
  printWidth: "80mm",
  billingDetails: "Demo",
};
const menu: MenuItem[] = [
  {
    id: "test-item",
    name: "Bowl",
    description: "Test",
    category: "Bowls",
    price: 20000,
    image: "",
    vegetarian: true,
    available: true,
    options: [{ id: "extra", name: "Extra", price: 3000 }],
    position: 0,
  },
];
const input = () =>
  orderInput.parse({
    version: 1,
    eventId: "test-event-001",
    restaurantId: "test",
    customer: {
      id: "test",
      name: "Test",
      phone: "+919876543210",
      verified: true,
    },
    items: [{ id: "test-item", quantity: 2, optionIds: ["extra"] }],
    fulfillment: "pickup",
    paymentMethod: "cod",
  });
test("server calculates paise totals and supported add-ons", () => {
  const t = calculate(input(), menu, settings);
  assert.equal(t.subtotal, 46000);
  assert.equal(t.tax, 2300);
  assert.equal(t.total, 49300);
});
test("checkout rejects changed totals, unavailable items and unknown options", () => {
  assert.throws(
    () => calculate({ ...input(), expectedTotal: 1 }, menu, settings),
    /Prices changed/,
  );
  assert.throws(
    () => calculate(input(), [{ ...menu[0], available: false }], settings),
    /sold out/,
  );
  assert.throws(
    () =>
      calculate(
        {
          ...input(),
          items: [{ id: "test-item", quantity: 1, optionIds: ["unknown"] }],
        },
        menu,
        settings,
      ),
    /Invalid menu option/,
  );
});
test("closed hours and unsupported delivery are rejected", () => {
  assert.throws(
    () => calculate(input(), menu, { ...settings, open: false }),
    /closed/,
  );
  assert.throws(
    () =>
      calculate(
        {
          ...input(),
          fulfillment: "delivery",
          address: { line: "Test street", area: "Unknown" },
        },
        menu,
        settings,
      ),
    /supported delivery/,
  );
  assert.throws(
    () =>
      calculate(
        input(),
        menu,
        { ...settings, opensAt: "10:00", closesAt: "11:00" },
        new Date("2026-01-01T18:00:00Z"),
      ),
    /closed/,
  );
});
test("overnight hours and minimum order are enforced", () => {
  assert.doesNotThrow(() =>
    calculate(
      input(),
      menu,
      { ...settings, opensAt: "22:00", closesAt: "02:00" },
      new Date("2026-01-01T18:00:00Z"),
    ),
  );
  assert.throws(
    () => calculate(input(), menu, { ...settings, minimumOrder: 100000 }),
    /minimum order/,
  );
});
test("pickup and delivery have distinct terminal transitions", () => {
  assert.deepEqual(nextStates("ready", "pickup"), ["collected", "cancelled"]);
  assert.deepEqual(nextStates("ready", "delivery"), [
    "out_for_delivery",
    "cancelled",
  ]);
  assert.deepEqual(nextStates("delivered", "delivery"), []);
  assert.deepEqual(nextStates("out_for_delivery", "pickup"), []);
});
test("signed callbacks reject tampering, malformed signatures, expired timestamps", () => {
  const timestamp = String(Math.floor(Date.now() / 1000)),
    body = '{"event":"test"}',
    secret = "secret",
    signature = sign(body, timestamp, secret);
  assert.equal(validSignature(body, timestamp, signature, secret), true);
  assert.equal(validSignature(body + " ", timestamp, signature, secret), false);
  assert.equal(validSignature(body, "1", signature, secret), false);
  assert.equal(validSignature(body, timestamp, "x", secret), false);
});
test("payload validation rejects unverified identities and invalid quantities", () => {
  assert.equal(
    orderInput.safeParse({
      ...input(),
      customer: { ...input().customer, verified: false },
    }).success,
    false,
  );
  assert.equal(
    orderInput.safeParse({
      ...input(),
      items: [{ id: "test-item", quantity: 0 }],
    }).success,
    false,
  );
});

import { expect, test } from "@playwright/test";
import { sign } from "../../src/lib/security";
const secret =
  process.env.WHATSAPP_ORDER_SECRET || "local-demo-change-before-sharing";
async function login(
  page: import("@playwright/test").Page,
  email = "owner@eatfood.local",
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Open my dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Your kitchen, at a glance." }),
  ).toBeVisible();
}
test("dashboard, shift alerts, responsive layout, navigation and print", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.getByRole("button", { name: "Start shift", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Alerts are on" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await context.setOffline(true);
  await expect(
    page.getByText("Connection lost.", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByText("Connection lost.", { exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Menu management" }).click();
  await expect(
    page.getByRole("heading", { name: "Good things on the menu." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Order history" }).click();
  await expect(
    page.getByRole("heading", { name: "Every order has a story." }),
  ).toBeVisible();
  const order = await page.request
    .get("/api/dashboard")
    .then((r) => r.json())
    .then((d) => d.orders[0]);
  await page.goto("/print/" + order.id + "?kind=ticket");
  await expect(page.getByText("KITCHEN TICKET", { exact: true })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("button", { name: "Print document" }),
  ).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Live orders", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Your kitchen, at a glance." }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Order history" }).click();
  const paymentFilter = await page
    .getByLabel("Payment status", { exact: true })
    .boundingBox();
  expect(paymentFilter?.width).toBeGreaterThan(120);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/history-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("verified mobile menu checkout → staff acceptance → collection → COD → tracking", async ({
  page,
  context,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Demo playground" }).click();
  await page.getByRole("button", { name: "Start a conversation" }).click();
  const menuLink = page.getByRole("link", { name: "Open customer menu" });
  await expect(menuLink).toBeVisible();
  const href = await menuLink.getAttribute("href");
  const customer = await context.newPage();
  await customer.setViewportSize({ width: 390, height: 844 });
  await customer.goto(href!);
  await expect(
    customer.getByText(
      "You’re ordering through a verified demo conversation.",
      { exact: false },
    ),
  ).toBeVisible();
  await customer.screenshot({
    path: "test-results/customer-menu-mobile.png",
    fullPage: true,
  });
  const item = customer.locator("article").filter({
    has: customer.getByRole("heading", {
      name: "Paneer Tikka Bowl",
      exact: true,
    }),
  });
  await item.getByRole("button", { name: "Add", exact: false }).click();
  await customer.getByRole("button", { name: "Close item" }).focus();
  await customer.keyboard.press("Shift+Tab");
  await expect(
    customer.getByRole("button", { name: "Add to your bag" }),
  ).toBeFocused();
  await customer.getByLabel("Extra raita").check();
  await customer.getByRole("button", { name: "Add to your bag" }).click();
  await customer.getByRole("button", { name: "View your bag" }).click();
  await customer.getByRole("button", { name: "Place my order" }).click();
  await expect(customer).toHaveURL(/\/track\//);
  await expect(
    customer.getByRole("heading", { name: "Your order is in good hands." }),
  ).toBeVisible();
  const trackToken = new URL(customer.url()).pathname.split("/").pop();
  const tracked = await customer.request
    .get("/api/public/tracking?token=" + trackToken)
    .then((r) => r.json());
  const id = tracked.order.id;
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "#" + tracked.order.reference.replace("EF-", ""),
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: tracked.order.reference });
  await dialog
    .getByRole("button", { name: "Accept order", exact: true })
    .click();
  await expect(
    dialog.getByText("Accepted", { exact: true }).first(),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Start preparing" }).click();
  await dialog.getByRole("button", { name: "Mark ready", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Mark collected", exact: true })
    .click();
  await expect(dialog.getByText("unpaid", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Record COD collected" }).click();
  await expect(dialog.getByText("paid", { exact: true })).toBeVisible();
  await expect(
    customer.getByRole("heading", { name: "Hope that hit the spot." }),
  ).toBeVisible({ timeout: 10000 });
  await page.request.post("/api/orders/" + id + "/bill", { data: {} });
  const bill = await page.request.get("/print/" + id + "?kind=bill");
  expect(await bill.text()).toContain("DEMO-");
  const privateData = await customer.request
    .get("/api/public/tracking?token=" + trackToken)
    .then((r) => r.json());
  expect(privateData.order.phone).toBeUndefined();
  expect(privateData.order.customer_name).toBeUndefined();
});
test("signed HTTP callbacks, duplicate replay, authorization and tracking boundaries", async ({
  request,
  page,
}) => {
  const payload = {
    version: 1,
    eventId: "e2e-" + crypto.randomUUID(),
    restaurantId: "r_demo",
    customer: {
      id: "e2e",
      name: "Callback Diner",
      phone: "+919876543210",
      verified: true,
    },
    items: [{ id: "butter-chicken", quantity: 1, optionIds: [] }],
    fulfillment: "delivery",
    address: { line: "24 Test Street", area: "Indiranagar" },
    paymentMethod: "cod",
  };
  const timestamp = String(Math.floor(Date.now() / 1000)),
    body = JSON.stringify(payload),
    headers = {
      "Content-Type": "application/json",
      "X-EatFood-Timestamp": timestamp,
      "X-EatFood-Signature": "sha256=" + sign(body, timestamp, secret),
    };
  expect(
    (
      await request.post("/api/integrations/whatsapp/orders", {
        data: body,
        headers: { ...headers, "X-EatFood-Signature": "bad" },
      })
    ).status(),
  ).toBe(401);
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      request
        .post("/api/integrations/whatsapp/orders", { data: body, headers })
        .then((r) => r.json()),
    ),
  );
  expect(new Set(results.map((r) => r.id)).size).toBe(1);
  expect(results.filter((r) => !r.duplicate).length).toBe(1);
  const changed = JSON.stringify({ ...payload, notes: "Changed payload" });
  expect(
    (
      await request.post("/api/integrations/whatsapp/orders", {
        data: changed,
        headers: {
          ...headers,
          "X-EatFood-Signature": sign(changed, timestamp, secret),
        },
      })
    ).status(),
  ).toBe(409);
  expect((await request.get("/api/orders/" + results[0].id)).status()).toBe(
    401,
  );
  expect(
    (await request.get("/api/public/tracking?token=invalid")).status(),
  ).toBe(404);
  expect(
    (
      await request.post("/api/customer/orders", {
        data: { sessionToken: "fake" },
      })
    ).status(),
  ).toBe(401);
  await login(page, "other@eatfood.local");
  expect(
    (await page.request.get("/api/orders/" + results[0].id)).status(),
  ).toBe(404);
});
test("staff cannot edit settings or menu and anonymous browsing cannot checkout", async ({
  page,
}) => {
  await login(page, "staff@eatfood.local");
  expect(
    (await page.request.patch("/api/settings", { data: {} })).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch("/api/menu/paneer-tikka", {
        data: { available: false },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/menu/the-good-bowl");
  await expect(
    page.getByText("You’re browsing the demo menu.", { exact: false }),
  ).toBeVisible();
});

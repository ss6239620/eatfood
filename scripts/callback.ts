import { existsSync, readFileSync } from "node:fs";
import { sign } from "../src/lib/security";
if (existsSync(".env")) process.loadEnvFile(".env");
const file = process.argv[2];
const body = file
  ? readFileSync(file, "utf8")
  : JSON.stringify({
      version: 1,
      eventId: "callback-" + crypto.randomUUID(),
      restaurantId: "r_demo",
      customer: {
        id: "integration-demo",
        name: "Jamie Patel",
        phone: "+919876543210",
        verified: true,
      },
      items: [{ id: "paneer-tikka", quantity: 1, optionIds: ["extra-raita"] }],
      fulfillment: "pickup",
      paymentMethod: "cod",
      notes: "A signed callback demo.",
    });
const timestamp = String(Math.floor(Date.now() / 1000));
const response = await fetch(
  (process.env.APP_URL || "http://localhost:3080") +
    "/api/integrations/whatsapp/orders",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-EatFood-Timestamp": timestamp,
      "X-EatFood-Signature":
        "sha256=" +
        sign(
          body,
          timestamp,
          process.env.WHATSAPP_ORDER_SECRET ||
            "local-demo-change-before-sharing",
        ),
    },
    body,
  },
);
console.log("HTTP", response.status);
console.log(await response.text());
if (!response.ok) process.exitCode = 1;

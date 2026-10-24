# EatFood

A complete local restaurant-ordering prototype: a warm, responsive Next.js dashboard, WhatsApp order callbacks, a mobile storefront, tracking, COD recording, simulated online payments and notifications, and printable kitchen tickets / sample bills.

## Start with Docker

Requirements: Docker Engine and Docker Compose. From this directory:

```sh
docker compose up --build -d
```

Open **http://localhost:3080**. PostgreSQL 18 uses a named volume. The one-shot migration service applies versioned SQL migrations and seeds the demo only when it does not already exist. Restarts preserve orders, settings, menu edits, and accounts.

| Role                      | Email               | Password         |
| ------------------------- | ------------------- | ---------------- |
| Owner                     | owner@eatfood.local | EatFoodDemo!2026 |
| Counter staff             | staff@eatfood.local | EatFoodDemo!2026 |
| Separate restaurant owner | other@eatfood.local | EatFoodDemo!2026 |

The other restaurant exists to verify access isolation. Its menu is intentionally empty. Owner/staff access is pre-seeded; user provisioning is not exposed in this demo.

```sh
docker compose ps
docker compose logs --tail=50 web worker migrate
docker compose stop
# Resume without deleting data:
docker compose up -d
```

The database and web ports bind only to localhost. These are local demo credentials, not production deployment settings. Demo contacts and online payments are **simulations**. Once configured, verified Meta WhatsApp contacts use the real messaging adapter; no real online payments are charged. Real COD collection entries are persisted separately from simulated online amounts. Meta webhook POST requests require WHATSAPP_APP_SECRET. Without it they return 503. Setting WHATSAPP_VERIFY_TOKEN enables the GET challenge; sender credentials and account IDs are required for real replies.

## Try the full workflow

1. Sign in as owner and click **Start shift** to enable browser audio.
2. Open **Demo playground → Start a conversation → Open customer menu**. The link binds a demo diner identity to a 30-minute server-side session.
3. Add items and supported add-ons; choose pickup or delivery and submit checkout.
4. Return to **Live orders**, open the new order, accept it with an estimate, and progress through fulfillment. Record COD collection separately.
5. Keep the tracking page open to observe server-confirmed updates. Print a kitchen ticket and issue / reprint a sample bill.
6. In the playground, send the structured callback twice without changing its event ID. Both responses identify the same order. A modified payload with that event ID returns 409.
7. Choose simulated online payment at checkout to try success/failure in the order drawer. Acceptance is blocked until simulated success. Rejecting a paid order creates a refund review; owners can confirm simulated refunds. Late success never reopens a closed order.
8. Simulate message failure, watch retries in the outbox, and retry the final failure from **Needs attention**.

The storefront can be browsed anonymously, but placing an order requires a secure conversation session. A typed phone number is never accepted as proof of identity. The seeded diner contact and restaurant contact are demonstration values.

## Signed order callback

Endpoint: `POST /api/integrations/whatsapp/orders`.

```json
{
  "version": 1,
  "eventId": "external-event-0001",
  "restaurantId": "r_demo",
  "customer": {
    "id": "provider-verified-customer-id",
    "name": "Jamie Patel",
    "phone": "+919876543210",
    "verified": true
  },
  "items": [
    { "id": "paneer-tikka", "quantity": 1, "optionIds": ["extra-raita"] }
  ],
  "fulfillment": "pickup",
  "paymentMethod": "cod",
  "notes": "Mild spice, please."
}
```

For delivery, include `address: { "line": "24, 2nd Cross", "area": "Indiranagar" }`. Supported areas are configured in Settings. Money is integer paise. The server looks up current menu prices; callers cannot supply their own prices. Optional `expectedTotal` rejects checkout when the displayed total has changed. Optional `marketingConsent` defaults to false.

Required headers:

- `X-EatFood-Timestamp`: Unix seconds, within five minutes.
- `X-EatFood-Signature`: `sha256=` followed by the hexadecimal HMAC-SHA256 of `timestamp + "." + exactRawRequestBody`, using `WHATSAPP_ORDER_SECRET`.

The configured key is bound to `r_demo`. The integration caller must establish the customer's verified identity; setting `verified: true` is an assertion by the authenticated provider, not a public verification mechanism. Free-form chat parsing is deliberately excluded.

Run an actual signed HTTP request:

```sh
npm ci
npx tsx scripts/callback.ts
# Save the JSON above into an event file, then replay the same event:
npx tsx scripts/callback.ts event.json
npx tsx scripts/callback.ts event.json
```

Success returns `{ id, reference, total, trackingPath, status, paymentStatus, duplicate }`. New orders return 201, duplicate replay 200, changed event contents 409, invalid signatures 401, invalid fields 422, and unavailable items / changed prices / closed restaurant 409. The tracking path is a bearer capability: keep it private. Callback receipt and outbound message creation are atomic with order creation.

## Local development and checks

Node.js 22 is used in Docker; local Node 20.19+ works.

```sh
npm ci
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
# In another terminal:
npm run worker
```

Stop the Docker web/worker services first when switching to host development, to avoid port conflicts and duplicate worker instances. Multiple workers are safe but unnecessary locally. Environment variables already set in the shell take precedence over `.env`.

```sh
npm run typecheck
npm test
npm run build
# With the app running on port 3080:
npx playwright install chromium
npm run test:e2e
```

Playwright uses an existing cached Chromium when present; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select another binary. `TEST_BASE_URL` overrides the default app URL. Browser tests leave a few clearly named demo orders. Database tests create isolated temporary restaurants and clean them up. Run tests against the local demo database only.

Architecture: App Router pages and API handlers in `src/app`; restaurant/customer components in `src/components`; Drizzle catalog access, transactional PostgreSQL order service, validation, sessions, and worker in `src/lib`. The database is the source of truth. The dashboard and tracking page poll every five seconds and refresh after reconnect. A message-job lease expires after 60 seconds; workers recover abandoned jobs, retry up to four times, and mark simulator results as **simulated**, never as actual delivery.

## Defaults and limits

- One seeded outlet, with restaurant-scoped staff, catalog, orders, jobs, payments, receipts, bills, and consent records.
- Demo hours are 24 hours (matching opening/closing time); settings support normal and overnight hours. An open/paused switch overrides hours.
- Minimum subtotal ₹100, packaging ₹10, delivery ₹30, and sample 5% tax. Tax treatment is a demo assumption requiring accountant review.
- Waiting-order alert after two minutes; automatic rejection after ten minutes. Both are configurable. Paid timeout rejections require refund review.
- Owner corrections of terminal states require a reason and produce an audit event. Pickup cannot be marked delivered.
- COD and fulfillment are independent. Completed order value is not labeled revenue; verified online funds, simulated online funds, recorded COD, unpaid value, and refunds are separate.
- Bills snapshot prices, business details, and payment status **at issuance**. Reprints retain that snapshot. They are demonstration documents, not verified tax invoices. Browser printing opens the print dialog; printer hardware and tax compliance are unverified.
- Daily summaries use Asia/Kolkata. History shows up to the latest 500 orders; archival pagination and CSV exports are outside this demo.
- Stock photos are illustrative. Replace them with the restaurant’s actual food photography before a pilot.
- No real Meta sender/templates, payment provider, SMS escalation, unattended printing, staff invitation flow, or production hosting is configured by default. Do not treat local success as a production/pilot readiness claim.

## Backup and restore

Create a PostgreSQL custom-format dump:

```sh
./scripts/backup.sh
```

Validate a backup by restoring into a separate empty database, leaving the demo database intact:

```sh
docker compose exec -T db createdb -U eatfood eatfood_restore_check
docker compose exec -T db pg_restore -U eatfood -d eatfood_restore_check --no-owner < backups/your-backup.dump
docker compose exec -T db psql -U eatfood -d eatfood_restore_check -c 'SELECT count(*) FROM orders;'
# Remove only the disposable verification database after inspection:
docker compose exec -T db dropdb -U eatfood eatfood_restore_check
```

For an intentional replacement restore, stop web and worker, back up current data, and restore into a fresh database before changing DATABASE_URL. Never delete the persistent volume as a routine restart step. Customer-data retention, deletion, production backups, actual integrations, and device/printer validation must be agreed before a live pilot.

## Development tools

The official shadcn MCP server was configured in the existing Codex configuration without overwriting other servers and verified through MCP initialization and tool discovery. It may require a new session to appear in the active tool list. Playwright provides browser verification. Context7 was unavailable due to administrator policy; official documentation was used instead.

## Connect Meta through ngrok

The public callback path is `/api/webhooks/whatsapp`. It is different from the custom signed order callback. Keep staff access on http://localhost:3080.

1. Configure `.env` with `WHATSAPP_VERIFY_TOKEN` (a value you choose), `WHATSAPP_APP_SECRET` (Meta App settings → Basic), `WHATSAPP_ACCESS_TOKEN` (the sender token), `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_WABA_ID`. Never commit these credentials.
2. Start `npm run webhook:gateway` in a separate terminal. This listens on loopback port 3082 and allows only the webhook, storefront, tracking, customer checkout, and static assets. Staff sign-in, dashboard APIs, demo controls, and bills are blocked publicly.
3. In another terminal run `ngrok http http://127.0.0.1:3082 --inspect=false`. Keep both processes running. Use the resulting HTTPS origin for `APP_URL` in `.env`.
4. Apply settings using `docker compose up --build -d`. Changing only `.env` needs `docker compose up -d` to recreate containers with updated values; Docker does not reload environment variables automatically.
5. In Meta’s WhatsApp webhook configuration, enter `https://YOUR-NGROK-HOST/api/webhooks/whatsapp` and exactly the verify token saved locally. Select **Verify and save**, then subscribe to **messages**. Select the WhatsApp Business Account webhook object if Meta asks which object to configure.
6. Verification GET requests return HTTP 200 and the exact `hub.challenge` as `text/plain`. Wrong tokens return 403. Notification POST requests authenticate `X-Hub-Signature-256` using HMAC-SHA256 over the raw request body and the Meta App secret. They return HTTP 200 with `{"received":true,"duplicate":false}` only after durable storage. The verify token is not the App secret or access token.
7. Send a real incoming message from an approved test recipient. The worker scopes the WABA/phone-number IDs, deduplicates the message, creates a verified customer session, and queues a real menu-link reply. Complete web checkout to create the order; an incoming “Hi” alone is not an order.

Authenticated owners can inspect `GET /api/whatsapp/status` locally for credential-presence flags and recent webhook processing metadata. It returns no secrets or message bodies. Missing sender/routing configuration keeps events/jobs queued for later processing. Real replies use the customer-service window; outside it the job fails visibly until approved template support is configured. Native in-chat payments are not enabled by this callback connection.

The tunnel is for development and depends on this computer staying online. Re-check its URL after restarting ngrok, update APP_URL, and update Meta’s callback if the URL changes. Treat the access token shown in any shared screenshot as exposed and rotate it before use.

## Prototype WhatsApp templates

The versioned English (US) Utility template catalog is in `src/lib/whatsapp-templates.ts`. It covers order receipt, acceptance, ready-for-pickup, out-for-delivery, completion, rejection, cancellation, failed delivery, payment received/failed, refund pending/completed, plus the generic order update. The immediate menu-link response stays a normal reply to an incoming customer message.

```sh
# Read current approval statuses from Meta; no messages are sent:
npm run whatsapp:templates
# Submit missing templates only; existing templates are preserved:
npm run whatsapp:templates -- --submit
```

Status snapshots are saved to `artifacts/whatsapp-template-status.json`. PENDING is not an approval. Review often takes a few minutes to 24 hours, but Meta controls the actual timing and can reject or reclassify a template. See https://docs.aws.amazon.com/social-messaging/latest/userguide/managing-templates-console-detailed.html for the documented review guidance.

Within the active customer-service window, the sender uses normal text replies with the catalog's wording. For order-linked updates outside that window, it checks Meta for the exact template name, language, APPROVED status, and UTILITY category before sending. Pending, rejected, or Marketing-classified templates are not used automatically. Failed jobs remain visible for explicit retry after the underlying issue is resolved. A verified WhatsApp contact is always required.

Completed orders, delivery failures, and recorded COD payments now queue their corresponding updates. Simulated online payments never generate real payment/refund confirmations. The online-payment failure and refund templates are prepared for the future verified payment-provider integration; submitting them does not enable actual payments or refunds. The separate Meta account-lock error 131031 must still be resolved before messages can be delivered.

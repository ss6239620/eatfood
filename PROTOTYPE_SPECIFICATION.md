# EatFood: WhatsApp Ordering Prototype Specification

Planning date: 19 October 2026  
Product: Web app for local food businesses in India  
Purpose: Demonstrate a complete direct-order workflow, then validate it through a small paid pilot

Companion document: [Business growth plan](BUSINESS_GROWTH_PLAN.md)

## 1. Prototype objective

Show a restaurant owner that a customer can start an order through WhatsApp, confirm items and payment choice, and receive updates while staff manage the order and bill through a web dashboard.

The prototype should prove that the workflow is understandable and useful. It does not need to replace the restaurant's existing POS, acquire diners automatically, or manage third-party delivery riders.

## 2. Initial scope and assumptions

- One initial restaurant and outlet, with a data model that can isolate additional restaurants later.
- A responsive web dashboard that works on a counter computer and the owner's phone.
- WhatsApp as the conversation and update channel.
- A mobile web menu opened from WhatsApp for browsing, cart, and checkout.
- Pickup or delivery handled by the restaurant's existing staff.
- COD and an online payment option after verifying provider onboarding.
- Basic menu availability, order alerts, order history, kitchen tickets, and bills.
- A real WhatsApp-connected demo is preferred; any simulated integration must be visibly labeled.

The mobile menu is a deliberate prototype choice. A full interactive menu inside WhatsApp can be evaluated later. Do not promise native in-chat payment availability without verifying it for the selected integration.

## 3. People using the system

| Person | Responsibilities |
| --- | --- |
| Diner | Choose items, confirm delivery or pickup, choose payment, view status |
| Counter staff | Accept/reject orders, inform kitchen, update fulfillment, record COD collection |
| Owner | Manage menu/settings, review orders and payments, supervise exceptions |
| Founder/operator | Onboard the restaurant, monitor failures, assist during the pilot |

In the first version, kitchen staff may receive printed tickets through counter staff. A dedicated kitchen screen is optional later.

## 4. End-to-end customer flow

1. Customer scans the restaurant's QR code or opens its WhatsApp link.
2. Customer sends an initial message; the business replies with a menu link.
3. Customer opens the mobile menu, adds items and quantities, and selects supported modifiers.
4. Checkout asks for customer name, pickup or delivery, and a delivery address when needed.
5. The system checks restaurant hours, service area, item availability, and any minimum order.
6. Customer sees items, applicable taxes, packaging/delivery charges, and the final total.
7. Customer selects online payment or COD and submits once.
8. Customer sees an order reference and “Awaiting restaurant acceptance.”
9. Staff accept with an estimated preparation time or reject with a reason.
10. Customer receives acceptance or rejection on WhatsApp.
11. Staff progress through preparing and ready, then delivery or pickup completion.
12. Customer can open a secure tracking link and receives selected WhatsApp updates.
13. The restaurant generates the bill and records final payment/fulfillment outcomes.

Bind an order to the initiating WhatsApp customer using a supported, verified identity flow. A typed phone number alone must not let someone access another customer's orders or trigger updates to an arbitrary number. Verify checkout contact details where they are not already trusted.

## 5. Order and payment state

### Fulfillment state

Delivery:

`Awaiting acceptance → Accepted → Preparing → Ready → Out for delivery → Delivered`

Pickup:

`Awaiting acceptance → Accepted → Preparing → Ready → Collected`

Exception outcomes:

- Rejected: restaurant declines before acceptance and records a reason.
- Cancelled: accepted order is stopped under the pilot's cancellation policy.
- Delivery failed: delivery attempt fails; staff records the outcome and next action.

Allow only valid state changes. Record who changed a state and when. Do not expose a “Delivered” action for a pickup order. Correction of a mistaken terminal state should require an owner action with an audit record.

### Payment state

`Unpaid / Pending / Paid / Failed / Refund pending / Refunded`

Keep the payment method separately: online payment or COD. Record partial refunds as amounts on refund records if they are needed during the pilot.

Rules:

- COD orders can be accepted while unpaid.
- Online orders requiring prepayment must have verified payment before acceptance.
- Browser redirects and payment screenshots are not payment confirmation.
- Confirm online payment through the provider's verified webhook or server-side lookup.
- Check amount, currency, restaurant, and order reference before marking paid.
- Duplicate notifications must not create duplicate orders, charges, or messages.
- Delivered/collected and paid are separate facts.
- A late successful payment after expiry or cancellation goes into staff review; it must not silently reactivate the order.

## 6. Payment, cancellation, and delivery policy

For the prototype, use a hosted payment checkout or UPI/payment link from a verified provider. Receive settlement into the restaurant's merchant account rather than assuming EatFood will collect and redistribute money.

Before the live pilot, agree:

- Whether online payment happens before acceptance or after stock confirmation.
- If payment is collected first, how a rejected order is refunded.
- How long an unpaid checkout stays valid.
- Who handles refunds, what the customer is told, and how resolution is tracked.
- Who can request cancellation and how staff approve it.
- Delivery area, delivery charge, minimum order, and COD restrictions.
- Who handles delivery failures, wrong addresses, and customer complaints.

Recommended first implementation: payment at checkout before acceptance, with an explicit rejection/refund procedure. If a provider cannot support the required refund process, start the live pilot with COD or pickup payment rather than pretending the online flow is complete.

Automated refund initiation can follow later, but a live pilot still needs an accountable manual process and visible refund status. Do not mark refunded until the provider confirms it.

## 7. Restaurant dashboard screens

### A. Sign-in and start shift

- Secure sign-in for authorized staff and owner.
- “Start shift” interaction to enable browser sound and test an alert.
- Prominent connection status and last successful sync time.
- Restaurant open/closed control.
- Clear instruction to keep the dashboard active; browser audio/background behavior must be tested on the actual device.

### B. Live orders

- Columns or filters for new, accepted/preparing, ready, delivery, and completed orders.
- Cards show reference, elapsed time, items, fulfillment type, total, and payment status.
- Persistent visual indicator and audible alert for new actionable orders.
- Accept/reject buttons with protection against repeated clicks.
- Accepted orders show the next valid action.
- Reconnect refresh retrieves orders missed while disconnected.

### C. Order detail

- Customer name, contact, and delivery address where relevant.
- Item quantities, options, notes, and price breakdown.
- Payment method, verified payment state, and reference.
- Preparation estimate, current status, and timestamp history.
- Kitchen-ticket and bill actions.
- Rejection/cancellation reason and refund follow-up where applicable.
- Visible WhatsApp message failure if an update could not be delivered or submitted.

### D. Menu management

- Categories, item names, descriptions, prices, and optional images.
- Simple supported variants or add-ons; do not imply arbitrary customization support.
- Available/sold-out toggle.
- Business-hours and restaurant-paused behavior.
- Revalidate checkout after a menu change; never silently charge a changed total.

### E. Order history and daily summary

- Search by reference and filter by date, fulfillment state, and payment state.
- Separate completed order value, verified online payments, COD collected, unpaid amounts, and refunds.
- Do not label all placed orders as revenue.
- Open a historical order and reprint its existing bill.

### F. Settings

- Business name, address, contact, and applicable billing details.
- Working hours, delivery areas, fees, and minimum order.
- WhatsApp connection and payment-provider status.
- Staff access and print format.

## 8. Customer-facing screens

- Mobile menu with clear availability and pricing.
- Cart with quantities, supported options, and a visible total.
- Checkout with fulfillment, address, payment choice, and all charges.
- Confirmation showing the reference and acceptance state.
- Secure tracking page showing preparation/delivery progress and restaurant contact.
- Clear rejection, cancellation, pending-payment, and payment-failure messages.

No customer app installation is required. Keep promotional consent optional and separate from order confirmation.

## 9. WhatsApp messages

Suggested messages:

| Trigger | Example content |
| --- | --- |
| Customer requests menu | Restaurant identity and menu link |
| Order submitted | Reference, total, payment state, awaiting acceptance |
| Accepted | Confirmation, preparation estimate, tracking link |
| Ready for pickup | Collection instructions |
| Out for delivery | Delivery update and tracking link |
| Rejected/cancelled | Reason and payment/refund next step |

Do not send every internal state change automatically. Start with messages customers actually need and measure cost and usefulness.

Use the official WhatsApp Business Platform directly or through an authorized provider. Verify onboarding, number eligibility, template requirements, customer-service windows, and current charges before committing to production behavior. A test number or sandbox may support only approved test recipients; explain that limitation during demos.

Store outbound message jobs, retry temporary failures with limits, and distinguish queued, submitted, delivered, and failed states where the provider exposes them. An API success response is not necessarily proof the customer received a message. The tracking page remains the fallback source of order status.

## 10. Bills and kitchen tickets

Kitchen ticket:

- Order reference and creation time.
- Pickup/delivery designation.
- Items, quantities, options, and preparation notes.
- Only the customer information necessary for the staff using it.

Customer bill:

- Business identity and applicable registration details.
- Bill number, date/time, order reference, and items.
- Subtotal, applicable taxes, delivery/packaging charges, discounts, and final amount.
- Payment status or receipt indication appropriate to the transaction.

Keep kitchen tickets and customer bills separate. Snapshot order prices at confirmation, assign bill numbers server-side, and make reprinting reproduce the issued bill. Record corrections rather than silently rewriting issued documents.

Start with a browser print layout. Browser printing may open a dialog; unattended thermal printing requires additional setup or a print helper. Test the actual paper width and printer. Treat sample bills as demonstration documents until the restaurant's accountant has verified applicable billing and tax requirements.

## 11. Suggested architecture

```text
Customer WhatsApp
      | inbound message / menu link
      v
Official WhatsApp integration <----> Backend + database + durable jobs
                                          ^      |       ^
                                          |      |       |
                                     Mobile menu |  Payment provider
                                          |      |  verified webhooks
                                          +------+
                                                 |
                                      realtime events / polling
                                                 |
                                                 v
                                     Restaurant web dashboard
                                                 |
                                          browser printing
```

Use a public HTTPS backend for webhooks, durable storage for orders, and background jobs for messages and reconciliation. Keep provider credentials on the server. Choose a stack the developer can maintain; the prototype does not require microservices.

Use realtime updates or short polling plus periodic reconciliation. The database is the source of truth; a lost WebSocket event must not lose an order.

## 12. Minimum data model

| Entity | Essential information |
| --- | --- |
| Restaurant/outlet | Identity, hours, delivery settings, integration references |
| Staff user/membership | Authentication identity, role, restaurant access |
| Menu item/options | Category, price, availability, supported choices |
| Customer | Restaurant-scoped contact identity and preferences |
| Order | Reference, restaurant, customer, fulfillment, totals, status, address snapshot |
| Order item | Item name/options/quantity and price snapshot |
| Order event | State change, actor, timestamp, reason |
| Payment/refund | Provider reference, verified amount, currency, state, timestamps |
| Bill | Number, order, issued breakdown, issue time, correction history |
| Message job | Recipient, order, template/type, retry count, provider reference, status |
| Webhook receipt | Provider event identifier and processing result for deduplication |
| Consent record | Customer, purpose, source, timestamp, withdrawal |

Store monetary amounts as integer paise or an exact decimal type. Use a consistent internal timestamp convention and display restaurant-local time, initially Asia/Kolkata. Apply restaurant access checks on the server, including live events, files, and exports.

## 13. Reliability and exception handling

- Use idempotency keys for order submission and provider events.
- Validate prices, quantities, charges, and transitions on the server.
- Handle staff acting on the same order concurrently without contradictory updates.
- If an item sells out after submission, reject with a clear explanation or obtain customer approval for a revised order; do not silently substitute.
- If an order remains unaccepted, repeat the local alert and escalate through a verified backup contact flow. A two-minute threshold is a configurable pilot hypothesis.
- If the restaurant does not respond, stop leaving customers indefinitely in “awaiting acceptance”; define timeout, closure, customer notification, and refund handling.
- When offline, display a persistent warning and retain readable recent orders where appropriate. New WhatsApp orders cannot arrive at an offline dashboard.
- Do not imply a status change synced until the server confirms it.
- If the dashboard is unavailable, use the agreed manual fallback and reconcile before normal service resumes.
- Keep a visible queue of payment mismatches, notification failures, and pending refunds for owner review.

## 14. Access and customer-data safeguards

- Require authenticated, authorized staff access; protect owner-only changes.
- Isolate restaurant data on every server operation, not only in frontend filters.
- Use unguessable tracking tokens and expose only necessary order information.
- Verify webhook authenticity and restrict repeated/abusive submissions.
- Keep secrets and complete customer/payment details out of logs.
- Avoid collecting card credentials; use provider-hosted payment interfaces.
- Define customer-data retention, access, and deletion handling before the pilot.
- Make backups and test restoration before relying on the system for live orders.

## 15. Build sequence

1. Build menu, cart, checkout, and order creation with a simple dashboard.
2. Add acceptance/rejection, fulfillment transitions, and event history.
3. Connect real WhatsApp inbound handling, menu link, and essential updates.
4. Add alerts, reconnect recovery, tracking page, and failed-message visibility.
5. Complete COD and verified online payments, including exception handling.
6. Add kitchen tickets, sample bills, menu controls, and daily summary.
7. Verify authentication, restaurant isolation, idempotency, and real-device behavior.
8. Run an owner demonstration, then prepare a bounded live pilot.

Do not attach a fixed delivery estimate until the stack, developer capacity, and integration approval requirements are known.

## 16. Acceptance checklist

### Ready to demonstrate

- [ ] An approved test customer starts in WhatsApp and reaches the correct menu.
- [ ] A submitted order appears on the correct restaurant dashboard.
- [ ] Staff hear an alert after starting the shift.
- [ ] Acceptance and a later fulfillment update reach the customer through the actual integration.
- [ ] The tracking page shows the same server-confirmed state.
- [ ] COD is visibly unpaid until collection is recorded.
- [ ] A sample kitchen ticket and bill contain the correct items and total.
- [ ] Any mock payment, sandbox recipient restriction, or simulated delivery is labeled clearly.

### Ready for a live paid pilot

- [ ] Production WhatsApp access, templates, recipient handling, and costs are verified.
- [ ] Payment success, failure, duplicate events, and late success are handled correctly.
- [ ] Rejected paid orders have a tested refund process and responsible operator.
- [ ] Repeated checkout submission creates one order.
- [ ] Reconnect retrieves missed orders without duplication.
- [ ] Two staff members cannot create conflicting transitions.
- [ ] Closed hours, sold-out items, and unsupported delivery addresses are handled.
- [ ] Customer A cannot view customer B's order; restaurant A cannot view restaurant B's data.
- [ ] Actual counter device and printer behavior are tested.
- [ ] Billing setup has been checked for the restaurant's applicable requirements.
- [ ] Staff understand alerts, payment state, manual fallback, and escalation.
- [ ] Menu, fees, cancellation terms, support hours, and pilot price are agreed.

## 17. Pilot measurements

Track weekly:

- Real orders submitted, accepted, rejected, completed, and cancelled.
- Missed orders, duplicate orders, payment mismatches, and failed notifications.
- Acceptance time and frequency of manual fallback.
- Staff time per order and support time per restaurant.
- Customer checkout completion and repeat ordering where measurable.
- Actual messaging, hosting, payment, and support costs.
- Whether the owner pays to continue and why.

The prototype succeeds commercially when staff use it for real orders and owners renew at a price that supports delivery of the service. A polished demonstration alone is not validation.

## 18. Explicitly deferred

- Full dine-in POS, table management, inventory, payroll, and recipe costing.
- Swiggy/Zomato aggregation before approved integration access and economics are known.
- Automated rider dispatch and fleet tracking.
- Native customer mobile apps or a desktop installer.
- Bulk marketing, loyalty points, and advanced campaign automation.
- AI ordering from unrestricted chat, voice notes, or ambiguous requests.
- Multi-outlet analytics and complex organizational permissions.
- Guaranteed offline receipt of WhatsApp orders or guaranteed unattended browser printing.

Add a deferred feature only when actual pilot evidence justifies it. Use the companion business plan to prioritize growth experiments and expansion.

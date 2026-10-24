import type { Order } from "./types";
import { money } from "./utils";
import type { TemplateValues } from "./whatsapp-templates";
export function orderTemplateValues(
  order: Order,
  kind: string,
  payload: Record<string, unknown>,
  address: string,
  tracking: string,
): TemplateValues {
  const payment = order.simulated_payment
    ? "Simulated online payment; no money was charged"
    : order.payment_status === "paid"
      ? "Payment recorded"
      : order.payment_method === "cod"
        ? "Cash due on " +
          (order.fulfillment === "pickup" ? "pickup" : "delivery")
        : "Online payment pending";
  return {
    name: order.customer_name,
    reference: order.reference,
    amount: money(order.total),
    payment,
    tracking,
    address,
    estimate:
      String(
        payload.estimate || order.estimate || "the agreed preparation time",
      ) + (payload.estimate || order.estimate ? " minutes" : ""),
    reason: String(
      payload.reason || "Please contact the restaurant for details",
    ),
    paymentNext: order.simulated_payment
      ? "Online payments in this demo are simulated; no money was charged"
      : order.payment_status === "refund_pending"
        ? "The restaurant must review the refund; it has not been confirmed"
        : order.payment_status === "refunded"
          ? "The refund has been confirmed"
          : order.payment_status === "paid"
            ? "Please contact the restaurant about your recorded payment"
            : "No payment has been recorded",
    outcome:
      kind === "delivered"
        ? "delivered"
        : kind === "collected"
          ? "collected"
          : order.status.replaceAll("_", " "),
  };
}

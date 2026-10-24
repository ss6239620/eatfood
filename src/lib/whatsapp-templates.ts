export type TemplateValues = Record<string, string>;
type TemplateDefinition = {
  kind: string;
  name: string;
  language: "en_US";
  category: "UTILITY";
  body: string;
  keys: string[];
  examples: string[];
};
const define = (
  kind: string,
  name: string,
  body: string,
  keys: string[],
  examples: string[],
): TemplateDefinition => ({
  kind,
  name,
  language: "en_US",
  category: "UTILITY",
  body,
  keys,
  examples,
});
export const whatsappTemplates: TemplateDefinition[] = [
  define(
    "order_submitted",
    "eatfood_order_received_v1",
    "Hi {{1}}, we received your EatFood order {{2}} for {{3}}. It is awaiting restaurant acceptance. Payment: {{4}}. Track your order: {{5}}. Reply here if you need help.",
    ["name", "reference", "amount", "payment", "tracking"],
    [
      "Alex",
      "EF-1042",
      "INR 562.90",
      "Cash due on delivery",
      "https://example.com/track/sample",
    ],
  ),
  define(
    "accepted",
    "eatfood_order_accepted_v1",
    "Hi {{1}}, the restaurant accepted your EatFood order {{2}}. Estimated preparation time: {{3}}. Track your order: {{4}}. Reply here if you need help.",
    ["name", "reference", "estimate", "tracking"],
    ["Alex", "EF-1042", "20 minutes", "https://example.com/track/sample"],
  ),
  define(
    "ready",
    "eatfood_pickup_ready_v1",
    "Hi {{1}}, your EatFood order {{2}} is ready for pickup at {{3}}. Order status: {{4}}. Please collect it from the restaurant counter.",
    ["name", "reference", "address", "tracking"],
    [
      "Alex",
      "EF-1042",
      "12 Main Road, Bengaluru",
      "https://example.com/track/sample",
    ],
  ),
  define(
    "out_for_delivery",
    "eatfood_out_for_delivery_v1",
    "Hi {{1}}, your EatFood order {{2}} is out for delivery. Check its status: {{3}}. Contact the restaurant if you need help with delivery.",
    ["name", "reference", "tracking"],
    ["Alex", "EF-1042", "https://example.com/track/sample"],
  ),
  define(
    "completed",
    "eatfood_order_completed_v1",
    "Hi {{1}}, your EatFood order {{2}} has been {{3}}. Thank you for ordering with us. Reply here if you need assistance with this order.",
    ["name", "reference", "outcome"],
    ["Alex", "EF-1042", "collected"],
  ),
  define(
    "rejected",
    "eatfood_order_rejected_v1",
    "Hi {{1}}, the restaurant could not accept your EatFood order {{2}}. Reason: {{3}}. Payment follow-up: {{4}}. Reply here if you need help.",
    ["name", "reference", "reason", "paymentNext"],
    [
      "Alex",
      "EF-1042",
      "The selected item is sold out",
      "No online payment was collected",
    ],
  ),
  define(
    "cancelled",
    "eatfood_order_cancelled_v1",
    "Hi {{1}}, your EatFood order {{2}} has been cancelled. Reason: {{3}}. Payment follow-up: {{4}}. Reply here if you need help.",
    ["name", "reference", "reason", "paymentNext"],
    [
      "Alex",
      "EF-1042",
      "Cancellation confirmed by the restaurant",
      "The restaurant will review the refund separately",
    ],
  ),
  define(
    "delivery_failed",
    "eatfood_delivery_failed_v1",
    "Hi {{1}}, the delivery attempt for your EatFood order {{2}} was unsuccessful. Reason: {{3}}. Please contact the restaurant to arrange the next step.",
    ["name", "reference", "reason"],
    ["Alex", "EF-1042", "The delivery address could not be located"],
  ),
  define(
    "payment_received",
    "eatfood_payment_received_v1",
    "Hi {{1}}, payment of {{2}} has been recorded for your EatFood order {{3}}. This confirms payment only; restaurant acceptance and fulfillment are shown separately. Thank you.",
    ["name", "amount", "reference"],
    ["Alex", "INR 562.90", "EF-1042"],
  ),
  define(
    "payment_failed",
    "eatfood_payment_failed_v1",
    "Hi {{1}}, payment for your EatFood order {{2}} was unsuccessful. Check the order status: {{3}}. Please contact the restaurant before trying again.",
    ["name", "reference", "tracking"],
    ["Alex", "EF-1042", "https://example.com/track/sample"],
  ),
  define(
    "refund_pending",
    "eatfood_refund_pending_v1",
    "Hi {{1}}, a refund of {{2}} for your EatFood order {{3}} is awaiting restaurant follow-up. This is not confirmation that money has been returned. Please contact the restaurant for an update.",
    ["name", "amount", "reference"],
    ["Alex", "INR 562.90", "EF-1042"],
  ),
  define(
    "refunded",
    "eatfood_refund_completed_v1",
    "Hi {{1}}, the payment provider has confirmed a refund of {{2}} for your EatFood order {{3}}. Bank processing times may vary. Please contact the restaurant if you need assistance.",
    ["name", "amount", "reference"],
    ["Alex", "INR 562.90", "EF-1042"],
  ),
  define(
    "order_update",
    "eatfood_order_update_v1",
    "Hi {{1}}, your EatFood order {{2}} is now {{3}}. Thank you for ordering with us.",
    ["name", "reference", "outcome"],
    ["Alex", "EF-1042", "ready for pickup"],
  ),
];
export function templateForKind(kind: string) {
  return whatsappTemplates.find(
    (t) =>
      t.kind ===
      (["delivered", "collected"].includes(kind) ? "completed" : kind),
  );
}
export function templateParameters(kind: string, values: TemplateValues) {
  const definition = templateForKind(kind);
  if (!definition) return null;
  const parameters = definition.keys.map((key) => {
    const value = values[key];
    if (!value?.trim())
      throw new Error("Missing WhatsApp template parameter: " + key);
    return {
      type: "text" as const,
      text: value.replace(/[\r\n\t]+/g, " ").slice(0, 1000),
    };
  });
  return { definition, parameters };
}
export function renderTemplate(kind: string, values: TemplateValues) {
  const result = templateParameters(kind, values);
  return result
    ? result.definition.body.replace(
        /\{\{(\d+)\}\}/g,
        (_, n) => result.parameters[Number(n) - 1].text,
      )
    : null;
}

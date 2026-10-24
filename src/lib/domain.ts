import { AppError } from "./errors";
import type { MenuItem, OrderItem, Settings } from "./types";
import type { OrderInput } from "./validation";
export const terminal = [
  "delivered",
  "collected",
  "rejected",
  "cancelled",
  "delivery_failed",
];
export function nextStates(status: string, fulfillment: string): string[] {
  const map: Record<string, string[]> = {
    awaiting: ["accepted", "rejected"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready:
      fulfillment === "pickup"
        ? ["collected", "cancelled"]
        : ["out_for_delivery", "cancelled"],
    out_for_delivery:
      fulfillment === "delivery"
        ? ["delivered", "delivery_failed", "cancelled"]
        : [],
  };
  return map[status] || [];
}
export function calculate(
  input: OrderInput,
  menu: MenuItem[],
  settings: Settings,
  now = new Date(),
) {
  const local = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
  const inHours =
    settings.opensAt === settings.closesAt ||
    (settings.opensAt < settings.closesAt
      ? local >= settings.opensAt && local < settings.closesAt
      : local >= settings.opensAt || local < settings.closesAt);
  if (!settings.open || !inHours)
    throw new AppError(409, "The restaurant is currently closed.");
  if (
    input.fulfillment === "delivery" &&
    (!input.address || !settings.deliveryAreas.includes(input.address.area))
  )
    throw new AppError(
      422,
      "Please choose a supported delivery area and provide an address.",
    );
  const items: OrderItem[] = input.items.map((row) => {
    const item = menu.find((m) => m.id === row.id);
    if (!item || !item.available)
      throw new AppError(
        409,
        "An item is sold out or no longer available. Please refresh the menu.",
      );
    if (new Set(row.optionIds).size !== row.optionIds.length)
      throw new AppError(422, "Duplicate options are not allowed.");
    const options = row.optionIds.map((id) => {
      const o = item.options.find((o) => o.id === id);
      if (!o) throw new AppError(422, "Invalid menu option.");
      return o;
    });
    const unitPrice = item.price + options.reduce((s, o) => s + o.price, 0);
    return {
      id: item.id,
      name: item.name,
      quantity: row.quantity,
      unitPrice,
      options,
      total: unitPrice * row.quantity,
    };
  });
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  if (subtotal < settings.minimumOrder)
    throw new AppError(
      422,
      "The order does not meet the minimum order amount.",
    );
  const tax = Math.round((subtotal * settings.taxBps) / 10000),
    deliveryFee = input.fulfillment === "delivery" ? settings.deliveryFee : 0,
    total = subtotal + tax + settings.packagingFee + deliveryFee;
  if (input.expectedTotal !== undefined && input.expectedTotal !== total)
    throw new AppError(
      409,
      "Prices changed. Please review the refreshed total before ordering.",
    );
  return {
    items,
    subtotal,
    tax,
    packaging: settings.packagingFee,
    deliveryFee,
    total,
  };
}

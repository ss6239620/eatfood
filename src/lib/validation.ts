import { z } from "zod";
export const orderInput = z.object({
  version: z.literal(1),
  eventId: z.string().min(8).max(120),
  restaurantId: z.string().max(100),
  customer: z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
    verified: z.literal(true),
  }),
  items: z
    .array(
      z.object({
        id: z.string(),
        quantity: z.number().int().min(1).max(20),
        optionIds: z.array(z.string()).max(5).default([]),
      }),
    )
    .min(1)
    .max(30),
  fulfillment: z.enum(["pickup", "delivery"]),
  address: z
    .object({
      line: z.string().min(5).max(300),
      area: z.string().min(1).max(100),
    })
    .optional(),
  paymentMethod: z.enum(["cod", "online"]),
  notes: z.string().max(500).default(""),
  expectedTotal: z.number().int().nonnegative().optional(),
  marketingConsent: z.boolean().default(false),
});
export type OrderInput = z.infer<typeof orderInput>;
export const settingsInput = z
  .object({
    open: z.boolean(),
    address: z.string().min(5).max(300),
    phone: z.string().min(8).max(30),
    deliveryAreas: z.array(z.string().min(1).max(100)).min(1).max(30),
    deliveryFee: z.number().int().min(0).max(100000),
    packagingFee: z.number().int().min(0).max(100000),
    minimumOrder: z.number().int().min(0).max(1000000),
    taxBps: z.number().int().min(0).max(3000),
    opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    alertMinutes: z.number().int().min(1).max(30),
    timeoutMinutes: z.number().int().min(2).max(120),
    printWidth: z.enum(["80mm", "A4"]),
    billingDetails: z.string().max(500),
  })
  .refine((s) => s.timeoutMinutes > s.alertMinutes, {
    message: "Timeout must be longer than the alert threshold.",
  });

import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
export const restaurants = pgTable("restaurants", {
  id: text().primaryKey(),
  slug: text().notNull(),
  name: text().notNull(),
  settings: jsonb().notNull(),
});
export const menuItems = pgTable("menu_items", {
  id: text().primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  name: text().notNull(),
  description: text().notNull(),
  category: text().notNull(),
  price: integer().notNull(),
  image: text().notNull(),
  vegetarian: boolean().notNull(),
  available: boolean().notNull(),
  options: jsonb().notNull(),
  position: integer().notNull(),
});
export const orders = pgTable("orders", {
  id: text().primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  reference: text().notNull(),
  status: text().notNull(),
  total: integer().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

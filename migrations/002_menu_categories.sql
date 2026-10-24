CREATE TABLE IF NOT EXISTS menu_categories (
 id text PRIMARY KEY,
 restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 name text NOT NULL,
 position integer NOT NULL DEFAULT 0,
 UNIQUE(restaurant_id, name)
);
INSERT INTO menu_categories(id, restaurant_id, name, position)
SELECT md5(restaurant_id || ':' || category), restaurant_id, category, min(position)
FROM menu_items GROUP BY restaurant_id, category
ON CONFLICT (restaurant_id, name) DO NOTHING;

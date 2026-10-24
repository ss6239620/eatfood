CREATE TABLE IF NOT EXISTS restaurants (
 id text PRIMARY KEY, slug text UNIQUE NOT NULL, name text NOT NULL, settings jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS staff (
 id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), email text UNIQUE NOT NULL, name text NOT NULL, role text NOT NULL CHECK(role IN ('owner','staff')), password_hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, staff_id text NOT NULL REFERENCES staff(id), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS customer_sessions (token_hash text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), customer_id text NOT NULL, name text NOT NULL, phone text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS menu_items (
 id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), name text NOT NULL, description text NOT NULL, category text NOT NULL, price integer NOT NULL CHECK(price >= 0), image text NOT NULL, vegetarian boolean NOT NULL DEFAULT true, available boolean NOT NULL DEFAULT true, options jsonb NOT NULL DEFAULT '[]', position integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
 id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), reference text UNIQUE NOT NULL, source text NOT NULL, customer_id text NOT NULL, customer_name text NOT NULL, phone text NOT NULL, fulfillment text NOT NULL CHECK(fulfillment IN ('pickup','delivery')), address jsonb, items jsonb NOT NULL, subtotal integer NOT NULL, tax integer NOT NULL, packaging integer NOT NULL, delivery_fee integer NOT NULL, total integer NOT NULL CHECK(total >= 0), status text NOT NULL DEFAULT 'awaiting', payment_method text NOT NULL CHECK(payment_method IN ('cod','online')), payment_status text NOT NULL, simulated_payment boolean NOT NULL DEFAULT false, notes text NOT NULL DEFAULT '', estimate integer, tracking_hash text UNIQUE NOT NULL, version integer NOT NULL DEFAULT 1, review_reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_restaurant_created ON orders(restaurant_id,created_at DESC);
CREATE TABLE IF NOT EXISTS order_events (id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), order_id text NOT NULL REFERENCES orders(id), kind text NOT NULL, actor text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS webhook_receipts (restaurant_id text NOT NULL REFERENCES restaurants(id), event_id text NOT NULL, payload_hash text NOT NULL, order_id text REFERENCES orders(id), response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(restaurant_id,event_id));
CREATE TABLE IF NOT EXISTS message_jobs (id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), order_id text REFERENCES orders(id), kind text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, provider_ref text, error text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS jobs_claim ON message_jobs(status,available_at);
CREATE TABLE IF NOT EXISTS payments (id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), order_id text NOT NULL REFERENCES orders(id), event_id text NOT NULL, kind text NOT NULL, amount integer NOT NULL, currency text NOT NULL DEFAULT 'INR', simulated boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(restaurant_id,event_id));
CREATE SEQUENCE IF NOT EXISTS bill_number_seq;
CREATE TABLE IF NOT EXISTS bills (id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), order_id text UNIQUE NOT NULL REFERENCES orders(id), number text UNIQUE NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS consent_records (id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), customer_id text NOT NULL, purpose text NOT NULL, source text NOT NULL, granted boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_events (id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id), actor text NOT NULL, action text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);

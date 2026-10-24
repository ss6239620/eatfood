CREATE TABLE IF NOT EXISTS whatsapp_webhooks (
 id text PRIMARY KEY,
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued',
 attempts integer NOT NULL DEFAULT 0,
 locked_at timestamptz,
 available_at timestamptz NOT NULL DEFAULT now(),
 error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_webhooks_pending ON whatsapp_webhooks(status,available_at);
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
 restaurant_id text NOT NULL REFERENCES restaurants(id),
 wa_id text NOT NULL,
 name text NOT NULL,
 phone_number_id text NOT NULL,
 last_message_at timestamptz NOT NULL,
 PRIMARY KEY (restaurant_id,wa_id)
);

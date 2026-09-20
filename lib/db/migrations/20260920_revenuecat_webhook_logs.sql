CREATE TABLE IF NOT EXISTS revenuecat_webhook_logs (
  id text PRIMARY KEY,
  event_id text,
  event_type text NOT NULL,
  app_id text,
  environment text,
  product_id text,
  customer_ref text,
  event_at timestamptz,
  event_expires_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  outcome text NOT NULL DEFAULT 'received',
  http_status integer,
  reason text,
  vip_changes jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS rc_webhook_logs_received_idx ON revenuecat_webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS rc_webhook_logs_event_idx ON revenuecat_webhook_logs(event_id);
CREATE INDEX IF NOT EXISTS rc_webhook_logs_customer_idx ON revenuecat_webhook_logs(customer_ref, received_at DESC);

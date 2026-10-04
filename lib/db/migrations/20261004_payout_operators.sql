BEGIN;
CREATE TABLE IF NOT EXISTS payout_operator_credentials (
 id text PRIMARY KEY, name text NOT NULL, role text NOT NULL CHECK(role IN('maker','checker','reconciler')),
 environment text NOT NULL CHECK(environment IN('development','production')), account_key text NOT NULL,
 token_hash text NOT NULL UNIQUE, created_by text NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, last_seen_at timestamptz, rate_window timestamptz, request_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payout_operator_browser_leases (
 id text PRIMARY KEY, credential_id text NOT NULL REFERENCES payout_operator_credentials(id),
 environment text NOT NULL, account_key text NOT NULL, resource text NOT NULL CHECK(resource='remitly-browser'),
 idempotency_key text NOT NULL, duration_seconds integer NOT NULL CHECK(duration_seconds BETWEEN 30 AND 900),
 fencing_token bigint NOT NULL, state text NOT NULL CHECK(state IN('active','released','expired')),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(credential_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS payout_operator_browser_active_idx ON payout_operator_browser_leases(environment,account_key,resource) WHERE state='active';
CREATE TABLE IF NOT EXISTS payout_operator_events (
 id bigserial PRIMARY KEY, environment text NOT NULL, account_key text NOT NULL, actor text NOT NULL,
 action text NOT NULL, target text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS payout_operator_events_immutable ON payout_operator_events;
CREATE TRIGGER payout_operator_events_immutable BEFORE UPDATE OR DELETE ON payout_operator_events FOR EACH ROW EXECUTE FUNCTION protect_creator_financial_history();
COMMIT;

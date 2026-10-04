BEGIN;
CREATE TABLE IF NOT EXISTS creator_cash_accounts (
 user_id integer PRIMARY KEY REFERENCES users(uid), enabled boolean NOT NULL DEFAULT true,
 repeat_allowed boolean NOT NULL DEFAULT false, enrolled_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creator_cash_ledger (
 id bigserial PRIMARY KEY, user_id integer NOT NULL REFERENCES creator_cash_accounts(user_id),
 kind text NOT NULL CHECK(kind IN('adjustment','reservation','release','settlement','return')),
 source_ref text NOT NULL UNIQUE, available_ticks bigint NOT NULL DEFAULT 0, reserved_ticks bigint NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), withdrawal_id text, actor text NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_cash_ledger_user_idx ON creator_cash_ledger(user_id);
CREATE TABLE IF NOT EXISTS creator_payout_recipients (
 user_id integer PRIMARY KEY REFERENCES users(uid), data jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creator_withdrawals (
 id text PRIMARY KEY, user_id integer NOT NULL REFERENCES creator_cash_accounts(user_id), account_key text NOT NULL,
 method_id text NOT NULL REFERENCES payout_catalog_methods(id), gross_cents integer NOT NULL CHECK(gross_cents=1500),
 idempotency_key text NOT NULL, request_hash text NOT NULL, recipient jsonb NOT NULL, route jsonb NOT NULL,
 status text NOT NULL DEFAULT 'awaiting_quote', quote jsonb, approved_quote_hash text, checker jsonb,
 provider_onboarding_status text NOT NULL DEFAULT 'pending', provider_link text, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS creator_withdrawals_unresolved_idx ON creator_withdrawals(user_id)
 WHERE status NOT IN('delivered','failed','canceled','returned');
CREATE TABLE IF NOT EXISTS creator_payout_attempts (
 id text PRIMARY KEY, withdrawal_id text NOT NULL REFERENCES creator_withdrawals(id), account_key text NOT NULL,
 maker text NOT NULL, state text NOT NULL DEFAULT 'preparing', binding_hash text NOT NULL, evidence jsonb,
 draft_id text, provider_reference text, activity_id text, lease_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_key,draft_id), UNIQUE(account_key,provider_reference), UNIQUE(account_key,activity_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS creator_payout_attempts_active_idx ON creator_payout_attempts(withdrawal_id)
 WHERE state NOT IN('delivered','failed','canceled','returned');
CREATE TABLE IF NOT EXISTS creator_payout_events (
 id bigserial PRIMARY KEY, withdrawal_id text REFERENCES creator_withdrawals(id), user_id integer,
 actor text NOT NULL, action text NOT NULL, evidence jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creator_payout_settings (id integer PRIMARY KEY CHECK(id=1), preparation_paused boolean NOT NULL DEFAULT false);
INSERT INTO creator_payout_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION protect_creator_financial_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Financial history is append-only'; END $$;
DROP TRIGGER IF EXISTS creator_cash_ledger_immutable ON creator_cash_ledger;
CREATE TRIGGER creator_cash_ledger_immutable BEFORE UPDATE OR DELETE ON creator_cash_ledger FOR EACH ROW EXECUTE FUNCTION protect_creator_financial_history();
DROP TRIGGER IF EXISTS creator_payout_events_immutable ON creator_payout_events;
CREATE TRIGGER creator_payout_events_immutable BEFORE UPDATE OR DELETE ON creator_payout_events FOR EACH ROW EXECUTE FUNCTION protect_creator_financial_history();
COMMIT;

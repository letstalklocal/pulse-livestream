CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id integer PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  date_of_birth date NOT NULL,
  terms_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL DEFAULT now()
);

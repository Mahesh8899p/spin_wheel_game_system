BEGIN;


CREATE EXTENSION IF NOT EXISTS pgcrypto;



DO $$ BEGIN
  CREATE TYPE wheel_status AS ENUM ('CREATED','OPEN','STARTING','RUNNING','ABORTED','COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE participant_status AS ENUM ('JOINED','ELIMINATED','WINNER','REFUNDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE txn_type AS ENUM (
    'ENTRY_DEBIT',
    'REFUND_CREDIT',
    'WINNER_PAYOUT',
    'ADMIN_PAYOUT',
    'APP_PAYOUT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;




CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT UNIQUE NOT NULL,
  is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);




CREATE TABLE IF NOT EXISTS wallets (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance     BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_updated_at ON wallets;
CREATE TRIGGER trg_wallet_updated_at
BEFORE UPDATE ON wallets
FOR EACH ROW
WHEN (OLD.balance IS DISTINCT FROM NEW.balance)
EXECUTE FUNCTION set_wallet_updated_at();




CREATE TABLE IF NOT EXISTS spin_wheels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES users(id),
  status           wheel_status NOT NULL DEFAULT 'OPEN',

  entry_fee        BIGINT NOT NULL CHECK (entry_fee > 0),
  min_participants INT NOT NULL DEFAULT 3 CHECK (min_participants >= 1),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  opens_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  auto_start_at    TIMESTAMPTZ NOT NULL,
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,


  winner_pool      BIGINT NOT NULL DEFAULT 0 CHECK (winner_pool >= 0),
  admin_pool       BIGINT NOT NULL DEFAULT 0 CHECK (admin_pool >= 0),
  app_pool         BIGINT NOT NULL DEFAULT 0 CHECK (app_pool >= 0),

  winner_id        UUID REFERENCES users(id)
);



CREATE UNIQUE INDEX IF NOT EXISTS one_active_wheel
ON spin_wheels ((1))
WHERE status IN ('CREATED','OPEN','STARTING','RUNNING');

CREATE INDEX IF NOT EXISTS idx_spin_wheels_status ON spin_wheels(status);
CREATE INDEX IF NOT EXISTS idx_spin_wheels_auto_start ON spin_wheels(auto_start_at);


-- PARTICIPANTS

CREATE TABLE IF NOT EXISTS wheel_participants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_id      UUID NOT NULL REFERENCES spin_wheels(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        participant_status NOT NULL DEFAULT 'JOINED',
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  eliminated_at TIMESTAMPTZ,
  UNIQUE (wheel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_wheel_status
ON wheel_participants (wheel_id, status);



CREATE TABLE IF NOT EXISTS wheel_elimination_queue (
  wheel_id      UUID NOT NULL REFERENCES spin_wheels(id) ON DELETE CASCADE,
  position      INT NOT NULL CHECK (position >= 1),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  eliminated    BOOLEAN NOT NULL DEFAULT FALSE,
  eliminated_at TIMESTAMPTZ,
  PRIMARY KEY (wheel_id, position),
  UNIQUE (wheel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_next
ON wheel_elimination_queue (wheel_id, eliminated, position);


-- DB-DRIVEN CONFIG FOR ENTRY FEE SPLIT

CREATE TABLE IF NOT EXISTS coin_distribution_config (
  id         INT PRIMARY KEY DEFAULT 1,
  winner_pct INT NOT NULL CHECK (winner_pct >= 0 AND winner_pct <= 100),
  admin_pct  INT NOT NULL CHECK (admin_pct  >= 0 AND admin_pct  <= 100),
  app_pct    INT NOT NULL CHECK (app_pct    >= 0 AND app_pct    <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (winner_pct + admin_pct + app_pct = 100)
);


INSERT INTO coin_distribution_config (id, winner_pct, admin_pct, app_pct)
VALUES (1, 80, 15, 5)
ON CONFLICT (id) DO NOTHING;




CREATE TABLE IF NOT EXISTS coin_transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wheel_id   UUID REFERENCES spin_wheels(id) ON DELETE SET NULL,
  type       txn_type NOT NULL,
  amount     BIGINT NOT NULL CHECK (amount > 0),
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_txn_user_created ON coin_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_wheel_created ON coin_transactions(wheel_id, created_at DESC);




CREATE TABLE IF NOT EXISTS idempotency_keys (
  key        TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
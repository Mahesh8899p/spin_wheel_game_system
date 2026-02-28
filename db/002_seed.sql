
INSERT INTO users (username, is_admin)
VALUES ('admin', true)
ON CONFLICT (username) DO UPDATE SET is_admin = EXCLUDED.is_admin;

INSERT INTO users (username, is_admin)
VALUES ('player1', false), ('player2', false), ('player3', false), ('player4', false)
ON CONFLICT (username) DO NOTHING;


INSERT INTO wallets (user_id, balance)
SELECT id, 1000
FROM users
ON CONFLICT (user_id) DO NOTHING;
-- Admin receipts/payments belong to an account, not a head.
-- Keep foreign keys for entries that still use heads (user submissions).
ALTER TABLE transactions ALTER COLUMN head_id DROP NOT NULL;
ALTER TABLE transaction_versions ALTER COLUMN head_id DROP NOT NULL;

UPDATE transaction_versions v
SET head_id = NULL, head_path = ''
FROM transactions t, users u
WHERE v.transaction_id = t.transaction_id
  AND t.created_by_user_id = u.user_id AND u.user_role_id = 1;

UPDATE transactions t
SET head_id = NULL
FROM users u
WHERE t.created_by_user_id = u.user_id AND u.user_role_id = 1;

INSERT INTO schema_version VALUES (6);

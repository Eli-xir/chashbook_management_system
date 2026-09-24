-- Version 3: preserve retired category data; new transactions no longer use it.
ALTER TABLE users ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE transaction_versions ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE user_head_permissions ADD COLUMN allowed boolean NOT NULL DEFAULT true;
ALTER TABLE transactions ALTER COLUMN category_group_id DROP NOT NULL;
ALTER TABLE transaction_versions ALTER COLUMN category_group_id DROP NOT NULL;
ALTER TABLE transaction_versions ALTER COLUMN category_name SET DEFAULT '';
INSERT INTO schema_version VALUES (3);

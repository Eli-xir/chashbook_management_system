ALTER TABLE users ADD COLUMN IF NOT EXISTS home_order text[] NOT NULL DEFAULT '{}';
INSERT INTO schema_version VALUES (8);

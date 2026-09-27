ALTER TABLE users ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;
INSERT INTO schema_version VALUES (7);

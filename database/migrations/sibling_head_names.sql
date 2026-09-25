-- PostgreSQL 15+: NULLS NOT DISTINCT treats root heads as siblings.
-- Safe to run again. Existing names, IDs, transactions and permissions are unchanged.
ALTER TABLE heads DROP CONSTRAINT IF EXISTS heads_head_name_key;
DROP INDEX IF EXISTS unique_live_head_name;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='heads' AND column_name='is_deleted') THEN
        CREATE UNIQUE INDEX IF NOT EXISTS unique_live_sibling_head_name
            ON heads (parent_head_id, head_name) NULLS NOT DISTINCT WHERE NOT is_deleted;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS unique_live_sibling_head_name
            ON heads (parent_head_id, head_name) NULLS NOT DISTINCT;
    END IF;
END $$;

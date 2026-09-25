-- Allow the same name under different parents; roots are siblings too.
DROP INDEX IF EXISTS unique_live_head_name;
ALTER TABLE heads DROP CONSTRAINT IF EXISTS heads_head_name_key;
-- Earlier local builds already created this index without recording version 4.
CREATE UNIQUE INDEX IF NOT EXISTS unique_live_sibling_head_name
    ON heads(parent_head_id, head_name) NULLS NOT DISTINCT WHERE NOT is_deleted;
INSERT INTO schema_version VALUES (4);

CREATE TABLE credit_users (
    credit_user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name varchar(48) NOT NULL CHECK (length(trim(user_name)) > 0),
    description text NOT NULL DEFAULT '',
    contacts text[] NOT NULL DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    is_pinned boolean NOT NULL DEFAULT false
);

ALTER TABLE transactions ADD COLUMN credit_user_id uuid REFERENCES credit_users;
INSERT INTO schema_version VALUES (5);

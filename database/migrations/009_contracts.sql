CREATE TABLE contracts (
    contract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(160) NOT NULL CHECK (length(trim(name)) > 0),
    description text NOT NULL DEFAULT '',
    total_amount numeric(18,2) NOT NULL CHECK (total_amount > 0),
    is_active boolean NOT NULL DEFAULT true,
    revision integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE contract_users (
    contract_id uuid NOT NULL REFERENCES contracts,
    credit_user_id uuid NOT NULL REFERENCES credit_users,
    PRIMARY KEY (contract_id, credit_user_id)
);
ALTER TABLE transactions ADD COLUMN contract_id uuid REFERENCES contracts;
ALTER TABLE transactions ADD CONSTRAINT transaction_contract_payer
    FOREIGN KEY (contract_id, credit_user_id) REFERENCES contract_users (contract_id, credit_user_id);
ALTER TABLE transactions ADD CONSTRAINT transaction_contract_requires_payer
    CHECK (contract_id IS NULL OR credit_user_id IS NOT NULL);
CREATE INDEX transactions_contract_idx ON transactions(contract_id) WHERE contract_id IS NOT NULL;
INSERT INTO schema_version VALUES (9);

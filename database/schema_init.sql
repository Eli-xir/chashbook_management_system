DROP TABLE Users;
CREATE TABLE Users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name VARCHAR(48) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  user_role_id int NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_activated_at TIMESTAMPTZ NOT NULL DEFAULT (now()),
  last_deactivated_at TIMESTAMPTZ
);

CREATE TABLE Images (
    image_id int PRIMARY KEY,
    image_url TEXT NOT NULL
);

CREATE TABLE Voice_notes (
    voice_id int PRIMARY KEY,
    voice_url TEXT NOT NULL
);

CREATE TABLE Transactions (
    transaction_id int PRIMARY KEY,
    head_id int NOT NULL,
    user_id UUID NOT NULL,
    current_version_id int UNIQUE NOT NULL
);

CREATE TABLE Transaction_versions (
    version_id int PRIMARY KEY,
    transaction_id int NOT NULL UNIQUE,
    transaction_amount int NOT NULL,
    payment_medium_id int NOT NULL,
    image_id int,
    voice_id int,
    transaction_type_id int NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (now()),
    CONSTRAINT positive_amount CHECK (transaction_amount >= 0)
);

CREATE TABLE Payment_mediums (
    payment_medium_id int PRIMARY KEY,
    payment_medium_name VARCHAR(48) UNIQUE NOT NULL,
    image_id int
);

CREATE TABLE Transaction_types (
    transaction_type_id int PRIMARY KEY,
    transaction_type_name VARCHAR(48) UNIQUE NOT NULL
);

CREATE TABLE Contacts (
    contact_id int PRIMARY KEY,
    contact_no VARCHAR(24) NOT NULL,
    user_id UUID NOT NULL
);

DROP TABLE User_roles;
CREATE TABLE User_roles (
    user_role_id int PRIMARY KEY,
    user_role_name VARCHAR(48) NOT NULL UNIQUE
);

CREATE TABLE Heads (
    head_id int PRIMARY KEY,
    parent_head_id int,
    head_name VARCHAR(48) UNIQUE NOT NULL,
    head_description TEXT,
    image_id int,
    CONSTRAINT head_parent_check CHECK (head_id <> parent_head_id)
);

CREATE TABLE User_head_permissions (
  head_id int NOT NULL,
  user_id UUID NOT NULL,
  PRIMARY KEY (head_id, user_id)
);

CREATE TABLE Sessions (
  session_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  expiry_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE User_head_permissions ADD CONSTRAINT user_permissions_heads FOREIGN KEY (user_id) REFERENCES Users (user_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Sessions ADD CONSTRAINT user_sessions FOREIGN KEY (user_id) REFERENCES Users (user_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Transaction_versions ADD CONSTRAINT transaction_versions_image_id FOREIGN KEY (image_id) REFERENCES Images (image_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Transaction_versions ADD CONSTRAINT transaction_versions_voice_id FOREIGN KEY (voice_id) REFERENCES Voice_notes (voice_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Contacts ADD CONSTRAINT user_contacts FOREIGN KEY (user_id) REFERENCES Users (user_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Heads ADD CONSTRAINT head_parent_head FOREIGN KEY (parent_head_id) REFERENCES Heads (head_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Transaction_versions ADD CONSTRAINT transactions_versions FOREIGN KEY (version_id) REFERENCES Transactions (current_version_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Transactions ADD CONSTRAINT head_transactions FOREIGN KEY (head_id) REFERENCES Heads (head_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Transactions ADD CONSTRAINT user_transactions FOREIGN KEY (user_id) REFERENCES Users (user_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Users ADD CONSTRAINT user_to_roles FOREIGN KEY (user_role_id) REFERENCES User_roles (user_role_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Transaction_versions ADD CONSTRAINT transaction_types FOREIGN KEY (transaction_type_id) REFERENCES Transaction_types (transaction_type_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Heads ADD CONSTRAINT heads_to_images FOREIGN KEY (image_id) REFERENCES Images (image_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Transaction_versions ADD CONSTRAINT payment_medium_transaction_version FOREIGN KEY (payment_medium_id) REFERENCES Payment_mediums (payment_medium_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Payment_mediums ADD CONSTRAINT payment_medium_image_id FOREIGN KEY (image_id) REFERENCES Images (image_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE Transaction_versions ADD CONSTRAINT versions_to_transactions FOREIGN KEY (transaction_id) REFERENCES Transactions (transaction_id) DEFERRABLE INITIALLY IMMEDIATE;

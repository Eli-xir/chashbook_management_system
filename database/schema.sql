DROP TABLE IF EXISTS "users" CASCADE;
CREATE TABLE "users" (
  "user_id" UUID PRIMARY KEY,
  "email" VARCHAR(256) UNIQUE,
  "password" VARCHAR(64) NOT NULL,
  "username" VARCHAR(128) UNIQUE,
  "image" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL,
  "is_active" BOOLEAN NOT NULL,
  "created_by" UUID,
  "status_changed_at" TIMESTAMPTZ,
  "status_changed_by" UUID
);

DROP TABLE IF EXISTS "contacts" CASCADE;
CREATE TABLE "contacts" (
  "contact_id" int PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "description" TEXT
);

DROP TABLE IF EXISTS "role" CASCADE;
CREATE TABLE "role" (
  "role_id" int PRIMARY KEY,
  "role_name" VARCHAR(128) NOT NULL
);

DROP TABLE IF EXISTS "user_role" CASCADE;
CREATE TABLE "user_role" (
  "user_id" UUID NOT NULL,
  "role_id" int NOT NULL,
  PRIMARY KEY ("user_id", "role_id")
);

DROP TABLE IF EXISTS "heads" CASCADE;
CREATE TABLE "heads" (
  "head_id" int PRIMARY KEY,
  "parenthead_id" int,
  "name" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL,
  "image" TEXT,
  "is_active" BOOLEAN NOT NULL,
  "status_changed_at" TIMESTAMPTZ,
  "status_changed_by" UUID
  CONSTRAINT "no_head_self_reference" CHECK (head_id != parenthead_id)
);

DROP TABLE IF EXISTS "vendor" CASCADE;
CREATE TABLE "vendor" (
  "vendor_id" int PRIMARY KEY,
  "name" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL,
  "created_by" UUID NOT NULL,
  "is_active" BOOLEAN NOT NULL,
  "status_changed_at" TIMESTAMPTZ,
  "status_changed_by" UUID
);

DROP TABLE IF EXISTS "head_vendor" CASCADE;
CREATE TABLE "head_vendor" (
  "vendor_id" int NOT NULL,
  "head_id" int NOT NULL,
  PRIMARY KEY ("vendor_id", "head_id")
);

DROP TABLE IF EXISTS "vendor_permissions" CASCADE;
CREATE TABLE "vendor_permissions" (
  "vendor_id" int,
  "user_id" UUID,
  "permission_given_by" UUID NOT NULL,
  PRIMARY KEY ("vendor_id", "user_id")
);

DROP TABLE IF EXISTS "head_permissions" CASCADE;
CREATE TABLE "head_permissions" (
  "head_id" int,
  "user_id" UUID,
  "permission_given_by" UUID NOT NULL,
  PRIMARY KEY ("head_id", "user_id")
);

DROP TABLE IF EXISTS "transaction" CASCADE;
CREATE TABLE "transaction" (
  "transaction_id" UUID PRIMARY KEY,
  "head_id" int NOT NULL,
  "vendor_id" int NOT NULL,
  "date" TIMESTAMPTZ NOT NULL,
  "by" UUID NOT NULL,
  "medium" int NOT NULL,
  "type_id" int NOT NULL,
  "amount" int NOT NULL,
  "description" TEXT,
  "img_url" TEXT,
  "voice_note" TEXT,
  CONSTRAINT "amount_check" CHECK (amount >= 0)
);

DROP TABLE IF EXISTS "payment_medium" CASCADE;
CREATE TABLE "payment_medium" (
  "medium_id" int PRIMARY KEY,
  "image_url" TEXT,
  "medium_name" VARCHAR(128) UNIQUE NOT NULL
);

DROP TABLE IF EXISTS "transaction_type" CASCADE;
CREATE TABLE "transaction_type" (
  "type_id" int PRIMARY KEY,
  "type_name" VARCHAR(128) NOT NULL,
  "multiplier" int NOT NULL DEFAULT 1,
  CONSTRAINT "valid_multiplier" CHECK (multiplier in (1,-1))
);

DROP TABLE IF EXISTS "amendment_review_types" CASCADE;
CREATE TABLE "amendment_review_types" (
  "review_id" int PRIMARY KEY,
  "type_name" VARCHAR(128) UNIQUE NOT NULL,
  "is_default" BOOLEAN UNIQUE,
  CONSTRAINT "only_one_default" CHECK (is_default IS NOT FALSE)
);

CREATE OR REPLACE FUNCTION default_amendment_review_type()
RETURNS INT
LANGUAGE SQL
AS $$
    SELECT review_id
    FROM amendment_review_types
    WHERE is_default = TRUE;
$$;

DROP TABLE IF EXISTS "transaction_amendment" CASCADE;
CREATE TABLE "transaction_amendment" (
  "amendment_id" UUID PRIMARY KEY,
  "transaction_id" UUID NOT NULL,
  "requested_at" TIMESTAMPTZ NOT NULL,
  "requested_by" UUID NOT NULL,
  "description" TEXT,
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by" UUID,
  "review_id" int NOT NULL DEFAULT (default_amendment_review_type()),
  "review_description" TEXT,
  "amount_after_amendment" int,
  "img_url_after_amendment" TEXT,
  "voice_url_after_amendment" TEXT,
  "amended_at" TIMESTAMPTZ
);

ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "users_to_contact";
ALTER TABLE "contacts" ADD CONSTRAINT "users_to_contact" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_role" DROP CONSTRAINT IF EXISTS "users_to_role";
ALTER TABLE "user_role" ADD CONSTRAINT "users_to_role" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_role" DROP CONSTRAINT IF EXISTS "role_to_users";
ALTER TABLE "user_role" ADD CONSTRAINT "role_to_users" FOREIGN KEY ("role_id") REFERENCES "role" ("role_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "head_vendor" DROP CONSTRAINT IF EXISTS "head_to_vendor";
ALTER TABLE "head_vendor" ADD CONSTRAINT "head_to_vendor" FOREIGN KEY ("head_id") REFERENCES "heads" ("head_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "head_vendor" DROP CONSTRAINT IF EXISTS "vendor_to_head";
ALTER TABLE "head_vendor" ADD CONSTRAINT "vendor_to_head" FOREIGN KEY ("vendor_id") REFERENCES "vendor" ("vendor_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "heads" DROP CONSTRAINT IF EXISTS "head_to_parenthead";
ALTER TABLE "heads" ADD CONSTRAINT "head_to_parenthead" FOREIGN KEY ("parenthead_id") REFERENCES "heads" ("head_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_created_by";
ALTER TABLE "users" ADD CONSTRAINT "users_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "vendor" DROP CONSTRAINT IF EXISTS "user_activate_vendor";
ALTER TABLE "vendor" ADD CONSTRAINT "user_activate_vendor" FOREIGN KEY ("created_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "vendor_permissions" DROP CONSTRAINT IF EXISTS "user_vendor_permission";
ALTER TABLE "vendor_permissions" ADD CONSTRAINT "user_vendor_permission" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "vendor_permissions" DROP CONSTRAINT IF EXISTS "vendor_user_permission";
ALTER TABLE "vendor_permissions" ADD CONSTRAINT "vendor_user_permission" FOREIGN KEY ("vendor_id") REFERENCES "vendor" ("vendor_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "head_permissions" DROP CONSTRAINT IF EXISTS "user_head_permissions";
ALTER TABLE "head_permissions" ADD CONSTRAINT "user_head_permissions" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "head_permissions" DROP CONSTRAINT IF EXISTS "head_user_permissions";
ALTER TABLE "head_permissions" ADD CONSTRAINT "head_user_permissions" FOREIGN KEY ("head_id") REFERENCES "heads" ("head_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "head_permissions" DROP CONSTRAINT IF EXISTS "assign_head_permission";
ALTER TABLE "head_permissions" ADD CONSTRAINT "assign_head_permission" FOREIGN KEY ("permission_given_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "vendor_permissions" DROP CONSTRAINT IF EXISTS "assign_vendor_permission";
ALTER TABLE "vendor_permissions" ADD CONSTRAINT "assign_vendor_permission" FOREIGN KEY ("permission_given_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "vendor" DROP CONSTRAINT IF EXISTS "user_change_vendor_status";
ALTER TABLE "vendor" ADD CONSTRAINT "user_change_vendor_status" FOREIGN KEY ("status_changed_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "user_change_user_status";
ALTER TABLE "users" ADD CONSTRAINT "user_change_user_status" FOREIGN KEY ("status_changed_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "heads" DROP CONSTRAINT IF EXISTS "user_change_head_status";
ALTER TABLE "heads" ADD CONSTRAINT "user_change_head_status" FOREIGN KEY ("status_changed_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "user_transaction";
ALTER TABLE "transaction" ADD CONSTRAINT "user_transaction" FOREIGN KEY ("by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "transaction_type";
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_type" FOREIGN KEY ("type_id") REFERENCES "transaction_type" ("type_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "transaction_payment_medium";
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_payment_medium" FOREIGN KEY ("medium") REFERENCES "payment_medium" ("medium_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "transaction_head_vendor";
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_head_vendor" FOREIGN KEY ("head_id", "vendor_id") REFERENCES "head_vendor" ("head_id", "vendor_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "transaction_amendment" DROP CONSTRAINT IF EXISTS "transaction_amendment_request";
ALTER TABLE "transaction_amendment" ADD CONSTRAINT "transaction_amendment_request" FOREIGN KEY ("requested_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "transaction_amendment" DROP CONSTRAINT IF EXISTS "transaction_amendment_approved";
ALTER TABLE "transaction_amendment" ADD CONSTRAINT "transaction_amendment_approved" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "transaction_amendment" DROP CONSTRAINT IF EXISTS "transaction_amendment_transaction";
ALTER TABLE "transaction_amendment" ADD CONSTRAINT "transaction_amendment_transaction" FOREIGN KEY ("transaction_id") REFERENCES "transaction" ("transaction_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "transaction_amendment" DROP CONSTRAINT IF EXISTS "transaction_amendment_review_type";
ALTER TABLE "transaction_amendment" ADD CONSTRAINT "transaction_amendment_review_type" FOREIGN KEY ("review_id") REFERENCES "amendment_review_types" ("review_id") DEFERRABLE INITIALLY IMMEDIATE;
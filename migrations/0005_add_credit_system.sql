-- Migration: Add credit-based system tables
-- Created: 2026-02-09

-- Credit Transactions - tracks all credit movements
CREATE TABLE IF NOT EXISTS "credit_transactions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "amount" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "description" text NOT NULL,
  "reference_type" text,
  "reference_id" integer,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- User Credit Rates - how many credits per message type
CREATE TABLE IF NOT EXISTS "user_credit_rates" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "sms_outbound_credits" integer NOT NULL DEFAULT 1,
  "sms_inbound_credits" integer NOT NULL DEFAULT 0,
  "mms_outbound_credits" integer NOT NULL DEFAULT 3,
  "mms_inbound_credits" integer NOT NULL DEFAULT 0,
  "credit_purchase_rate" text NOT NULL DEFAULT '0.01',
  "low_balance_threshold" integer NOT NULL DEFAULT 50,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Credit Packages - predefined credit bundles for purchase
CREATE TABLE IF NOT EXISTS "credit_packages" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "credits" integer NOT NULL,
  "price" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_credit_transactions_user" ON "credit_transactions"("user_id");
CREATE INDEX IF NOT EXISTS "idx_credit_transactions_type" ON "credit_transactions"("type");
CREATE INDEX IF NOT EXISTS "idx_credit_transactions_created" ON "credit_transactions"("created_at");
CREATE INDEX IF NOT EXISTS "idx_user_credit_rates_user" ON "user_credit_rates"("user_id");
CREATE INDEX IF NOT EXISTS "idx_credit_packages_active" ON "credit_packages"("is_active");

-- Insert default credit packages
INSERT INTO "credit_packages" ("name", "credits", "price", "description", "sort_order") VALUES
  ('Starter', 100, '10.00', 'Perfect for getting started', 1),
  ('Pro', 500, '45.00', 'Best value for growing businesses', 2),
  ('Enterprise', 2000, '150.00', 'High volume messaging', 3)
ON CONFLICT DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE "credit_transactions" IS 'Tracks all credit movements for audit trail';
COMMENT ON TABLE "user_credit_rates" IS 'Per-user credit consumption rates';
COMMENT ON TABLE "credit_packages" IS 'Predefined credit bundles for purchase';

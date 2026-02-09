-- Migration: Add usage-based pricing tables for client billing
-- Created: 2026-02-07

-- User Pricing Configuration - rates set by admin per client
CREATE TABLE IF NOT EXISTS "user_pricing_config" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "sms_outbound_rate" text NOT NULL DEFAULT '0.015',
  "sms_inbound_rate" text NOT NULL DEFAULT '0.01',
  "mms_outbound_rate" text NOT NULL DEFAULT '0.05',
  "mms_inbound_rate" text NOT NULL DEFAULT '0.03',
  "monthly_phone_number_fee" text NOT NULL DEFAULT '0',
  "billing_cycle_day" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- User Usage Records - tracks each message for billing
CREATE TABLE IF NOT EXISTS "user_usage_records" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "phone_number_id" integer REFERENCES "account_phone_numbers"("id") ON DELETE SET NULL,
  "message_type" text NOT NULL,
  "direction" text NOT NULL,
  "segment_count" integer NOT NULL DEFAULT 1,
  "rate_applied" text NOT NULL,
  "cost" text NOT NULL,
  "message_sid" text,
  "sms_message_id" integer REFERENCES "sms_messages"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- User Billing Summary - monthly billing periods
CREATE TABLE IF NOT EXISTS "user_billing_summary" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "period_start" timestamp NOT NULL,
  "period_end" timestamp NOT NULL,
  "total_sms_outbound" integer NOT NULL DEFAULT 0,
  "total_sms_inbound" integer NOT NULL DEFAULT 0,
  "total_mms_outbound" integer NOT NULL DEFAULT 0,
  "total_mms_inbound" integer NOT NULL DEFAULT 0,
  "sms_cost" text NOT NULL DEFAULT '0',
  "mms_cost" text NOT NULL DEFAULT '0',
  "phone_number_fees" text NOT NULL DEFAULT '0',
  "total_cost" text NOT NULL DEFAULT '0',
  "status" text NOT NULL DEFAULT 'pending',
  "paid_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_user_pricing_config_user" ON "user_pricing_config"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_usage_records_user" ON "user_usage_records"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_usage_records_created" ON "user_usage_records"("created_at");
CREATE INDEX IF NOT EXISTS "idx_user_usage_records_type" ON "user_usage_records"("message_type", "direction");
CREATE INDEX IF NOT EXISTS "idx_user_billing_summary_user" ON "user_billing_summary"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_billing_summary_period" ON "user_billing_summary"("period_start", "period_end");
CREATE INDEX IF NOT EXISTS "idx_user_billing_summary_status" ON "user_billing_summary"("status");

-- Add comments for documentation
COMMENT ON TABLE "user_pricing_config" IS 'Stores per-user pricing rates for SMS/MMS usage';
COMMENT ON TABLE "user_usage_records" IS 'Tracks individual message usage for billing purposes';
COMMENT ON TABLE "user_billing_summary" IS 'Monthly billing summaries for each user';

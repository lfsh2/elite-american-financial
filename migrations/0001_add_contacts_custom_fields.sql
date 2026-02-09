-- Add custom_fields column to contacts table for storing custom data from CSV imports
-- This allows storing fields like debt_loads, dollar_amount, etc. from Google Sheets/CSV imports
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb;

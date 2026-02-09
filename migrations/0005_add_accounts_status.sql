-- Migration: Add status column to accounts table if missing
-- Created: 2026-02-07

-- Add status column to accounts table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'accounts' AND column_name = 'status'
  ) THEN
    ALTER TABLE "accounts" ADD COLUMN "status" text NOT NULL DEFAULT 'active';
  END IF;
END $$;

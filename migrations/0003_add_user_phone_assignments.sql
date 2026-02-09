-- Add new columns to users table for role-based account system
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "assigned_phone_number_id" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp;

-- Update role comment (super_admin, user)
COMMENT ON COLUMN "users"."role" IS 'super_admin or user (client)';

-- Create user_phone_assignments table for many-to-many relationship
CREATE TABLE IF NOT EXISTS "user_phone_assignments" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "phone_number_id" integer NOT NULL REFERENCES "account_phone_numbers"("id") ON DELETE CASCADE,
  "is_primary" boolean DEFAULT false,
  "can_send" boolean DEFAULT true,
  "can_receive" boolean DEFAULT true,
  "assigned_at" timestamp NOT NULL DEFAULT now(),
  "assigned_by" integer REFERENCES "users"("id") ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_user_phone_assignments_user" ON "user_phone_assignments"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_phone_assignments_phone" ON "user_phone_assignments"("phone_number_id");
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users"("status");
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users"("role");

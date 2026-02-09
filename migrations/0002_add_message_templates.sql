-- Create message_templates table for reusable campaign message templates
CREATE TABLE IF NOT EXISTS "message_templates" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL REFERENCES "users"("id"),
    "account_id" integer REFERENCES "accounts"("id"),
    "name" text NOT NULL,
    "content" text NOT NULL,
    "description" text,
    "category" text,
    "is_default" boolean DEFAULT false,
    "usage_count" integer DEFAULT 0,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "account_phone_numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"phone_number" text NOT NULL,
	"friendly_name" text,
	"capabilities" jsonb DEFAULT '{"sms":true,"voice":true,"mms":false}'::jsonb,
	"provider_sid" text,
	"is_default" boolean DEFAULT false,
	"status" text DEFAULT 'active' NOT NULL,
	"monthly_cost" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"parent_account_id" integer,
	"provider_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"account_sid" text,
	"auth_token" text,
	"api_key" text,
	"api_secret" text,
	"friendly_name" text,
	"default_phone_number" text,
	"timezone" text DEFAULT 'UTC',
	"settings" jsonb DEFAULT '{}'::jsonb,
	"phone_number_count" integer DEFAULT 0,
	"monthly_spend" double precision DEFAULT 0,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"secret" text NOT NULL,
	"permissions" text[],
	"last_used" timestamp,
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"ip_restrictions" text[],
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "billing_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" double precision NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"credits" integer,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"company_name" text NOT NULL,
	"ein" text,
	"business_type" text NOT NULL,
	"vertical" text NOT NULL,
	"contact_first_name" text NOT NULL,
	"contact_last_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"street" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'US',
	"website_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"external_brand_id" text,
	"brand_score" integer,
	"provider_id" integer,
	"provider_brand_sid" text,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"sms_campaign_id" integer NOT NULL,
	"contact_id" integer,
	"phone_number" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"custom_fields" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"message_sid" text,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"failed_at" timestamp,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" integer,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"message" text NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "contact_list_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_list_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" integer,
	"name" text NOT NULL,
	"description" text,
	"contact_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"first_name" text,
	"last_name" text,
	"phone_number" text,
	"email" text,
	"tags" text[],
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"to" text NOT NULL,
	"from" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp NOT NULL,
	"campaign_id" integer,
	"message_id" text
);
--> statement-breakpoint
CREATE TABLE "messaging_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_registration_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"campaign_name" text NOT NULL,
	"description" text NOT NULL,
	"use_case" text NOT NULL,
	"sub_use_case" text,
	"sample_messages" text[],
	"message_flow" text,
	"opt_in_type" text NOT NULL,
	"opt_in_message" text,
	"opt_out_message" text DEFAULT 'Reply STOP to unsubscribe',
	"help_message" text DEFAULT 'Reply HELP for assistance',
	"opt_in_keywords" text[] DEFAULT '{"START","YES","SUBSCRIBE"}',
	"opt_out_keywords" text[] DEFAULT '{"STOP","UNSUBSCRIBE","CANCEL"}',
	"help_keywords" text[] DEFAULT '{"HELP","INFO"}',
	"has_embedded_links" boolean DEFAULT false,
	"has_embedded_phone" boolean DEFAULT false,
	"has_age_gated_content" boolean DEFAULT false,
	"status" text DEFAULT 'draft' NOT NULL,
	"external_campaign_id" text,
	"provider_campaign_sid" text,
	"messaging_service_sid" text,
	"daily_limit" integer,
	"monthly_limit" integer,
	"throughput_limit" integer,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opt_out_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"phone_number" text NOT NULL,
	"reason" text,
	"source" text,
	"opted_out_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" integer NOT NULL,
	"plan" text DEFAULT 'starter' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "providers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sms_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" integer,
	"messaging_campaign_id" integer,
	"name" text NOT NULL,
	"description" text,
	"message_template" text NOT NULL,
	"media_urls" text[],
	"from_number" text NOT NULL,
	"contact_list_id" integer,
	"recipient_count" integer DEFAULT 0,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"sending_rate" integer DEFAULT 1,
	"timezone" text DEFAULT 'UTC',
	"sent_count" integer DEFAULT 0,
	"delivered_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"opt_out_count" integer DEFAULT 0,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" integer,
	"to" text NOT NULL,
	"from" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"direction" text NOT NULL,
	"sent_at" timestamp NOT NULL,
	"message_sid" text,
	"campaign_id" integer,
	"media_urls" text[],
	"provider_code" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "sms_messages_message_sid_unique" UNIQUE("message_sid")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"parent_id" integer,
	"is_sub_account" boolean DEFAULT false NOT NULL,
	"auto_refill_enabled" boolean DEFAULT false,
	"auto_refill_threshold" integer DEFAULT 100,
	"auto_refill_amount" integer DEFAULT 1000,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "voice_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" integer,
	"to" text NOT NULL,
	"from" text NOT NULL,
	"status" text NOT NULL,
	"direction" text NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"duration" integer,
	"call_sid" text,
	"recording_url" text
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"events" text[],
	"created_at" timestamp NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"secret" text,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"last_response" jsonb,
	"retry_enabled" boolean DEFAULT true,
	"retry_count" integer DEFAULT 3,
	"retry_interval" integer DEFAULT 60,
	"last_success_at" timestamp,
	"last_failure_at" timestamp,
	"delivery_logs" jsonb
);
--> statement-breakpoint
ALTER TABLE "account_phone_numbers" ADD CONSTRAINT "account_phone_numbers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_users" ADD CONSTRAINT "account_users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_users" ADD CONSTRAINT "account_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_account_id_accounts_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_registrations" ADD CONSTRAINT "brand_registrations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_registrations" ADD CONSTRAINT "brand_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_registrations" ADD CONSTRAINT "brand_registrations_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_sms_campaign_id_sms_campaigns_id_fk" FOREIGN KEY ("sms_campaign_id") REFERENCES "public"."sms_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_contact_list_id_contact_lists_id_fk" FOREIGN KEY ("contact_list_id") REFERENCES "public"."contact_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_campaigns" ADD CONSTRAINT "messaging_campaigns_brand_registration_id_brand_registrations_id_fk" FOREIGN KEY ("brand_registration_id") REFERENCES "public"."brand_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_campaigns" ADD CONSTRAINT "messaging_campaigns_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_campaigns" ADD CONSTRAINT "messaging_campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opt_out_list" ADD CONSTRAINT "opt_out_list_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD CONSTRAINT "sms_campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD CONSTRAINT "sms_campaigns_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD CONSTRAINT "sms_campaigns_messaging_campaign_id_messaging_campaigns_id_fk" FOREIGN KEY ("messaging_campaign_id") REFERENCES "public"."messaging_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD CONSTRAINT "sms_campaigns_contact_list_id_contact_lists_id_fk" FOREIGN KEY ("contact_list_id") REFERENCES "public"."contact_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sms_user_sent" ON "sms_messages" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "idx_sms_account_sent" ON "sms_messages" USING btree ("account_id","sent_at");--> statement-breakpoint
CREATE INDEX "idx_sms_from" ON "sms_messages" USING btree ("from");--> statement-breakpoint
CREATE INDEX "idx_sms_to" ON "sms_messages" USING btree ("to");--> statement-breakpoint
CREATE INDEX "idx_sms_status" ON "sms_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sms_direction" ON "sms_messages" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "idx_sms_message_sid" ON "sms_messages" USING btree ("message_sid");
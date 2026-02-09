-- Migration: Add indexes for large-scale contact handling (100k+ contacts)
-- Created: 2026-02-10

-- ============================================
-- CONTACTS TABLE INDEXES
-- ============================================

-- Primary lookup by user
CREATE INDEX IF NOT EXISTS "idx_contacts_user_id" ON "contacts"("user_id");

-- Phone number lookup (critical for deduplication and search)
CREATE INDEX IF NOT EXISTS "idx_contacts_phone_number" ON "contacts"("phone_number");

-- Composite index for user + phone (most common query pattern)
CREATE INDEX IF NOT EXISTS "idx_contacts_user_phone" ON "contacts"("user_id", "phone_number");

-- Email lookup
CREATE INDEX IF NOT EXISTS "idx_contacts_email" ON "contacts"("email");

-- Created at for sorting/pagination
CREATE INDEX IF NOT EXISTS "idx_contacts_created_at" ON "contacts"("created_at");

-- Tags for filtering (GIN index for array)
CREATE INDEX IF NOT EXISTS "idx_contacts_tags" ON "contacts" USING GIN ("tags");

-- ============================================
-- CONTACT LISTS TABLE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS "idx_contact_lists_user_id" ON "contact_lists"("user_id");
CREATE INDEX IF NOT EXISTS "idx_contact_lists_account_id" ON "contact_lists"("account_id");

-- ============================================
-- CONTACT LIST MEMBERS TABLE INDEXES (Critical for large lists)
-- ============================================

-- Lookup by list (most common - getting all contacts in a list)
CREATE INDEX IF NOT EXISTS "idx_contact_list_members_list_id" ON "contact_list_members"("contact_list_id");

-- Lookup by contact (finding which lists a contact belongs to)
CREATE INDEX IF NOT EXISTS "idx_contact_list_members_contact_id" ON "contact_list_members"("contact_id");

-- Composite for checking membership
CREATE INDEX IF NOT EXISTS "idx_contact_list_members_list_contact" ON "contact_list_members"("contact_list_id", "contact_id");

-- ============================================
-- CAMPAIGN RECIPIENTS TABLE INDEXES (Critical for batch sending)
-- ============================================

CREATE INDEX IF NOT EXISTS "idx_campaign_recipients_campaign_id" ON "campaign_recipients"("sms_campaign_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_recipients_contact_id" ON "campaign_recipients"("contact_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_recipients_phone" ON "campaign_recipients"("phone_number");
CREATE INDEX IF NOT EXISTS "idx_campaign_recipients_status" ON "campaign_recipients"("status");

-- Composite for campaign + status (getting pending recipients)
CREATE INDEX IF NOT EXISTS "idx_campaign_recipients_campaign_status" ON "campaign_recipients"("sms_campaign_id", "status");

-- ============================================
-- SMS CAMPAIGNS TABLE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS "idx_sms_campaigns_user_id" ON "sms_campaigns"("user_id");
CREATE INDEX IF NOT EXISTS "idx_sms_campaigns_status" ON "sms_campaigns"("status");
CREATE INDEX IF NOT EXISTS "idx_sms_campaigns_contact_list_id" ON "sms_campaigns"("contact_list_id");

-- ============================================
-- ANALYZE TABLES (Update statistics for query planner)
-- ============================================

ANALYZE "contacts";
ANALYZE "contact_lists";
ANALYZE "contact_list_members";
ANALYZE "campaign_recipients";
ANALYZE "sms_campaigns";

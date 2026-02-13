-- Add new campaign mode fields to sms_campaigns table
-- Supports: Scheduled mode, Time Zone Scheduling, Campaign Options, Automated Response, Permissions

-- Send mode: 'immediate', 'scheduled', 'drip'
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'immediate';

-- Drip mode settings (moved from client-only to persisted)
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS drip_messages_per_minute integer DEFAULT 30;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS drip_concurrent_per_number integer DEFAULT 20;

-- Time zone scheduling
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS timezone_scheduling_enabled boolean DEFAULT false;

-- Campaign options
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS forward_number_override text;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS filter_channels_enabled boolean DEFAULT false;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS disable_claims_enabled boolean DEFAULT false;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS opt_out_message_enabled boolean DEFAULT false;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS opt_out_message_text text DEFAULT 'Reply STOP to Opt-Out';

-- Automated response
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS auto_response_enabled boolean DEFAULT false;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS auto_response_message text;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS auto_response_keywords text[] DEFAULT '{}';

-- Enhanced metrics
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS response_count integer DEFAULT 0;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS link_click_count integer DEFAULT 0;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS invalid_number_count integer DEFAULT 0;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS spam_report_count integer DEFAULT 0;
ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

-- Campaign permissions table
CREATE TABLE IF NOT EXISTS campaign_permissions (
  id SERIAL PRIMARY KEY,
  sms_campaign_id integer NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  user_group text,
  permission_type text NOT NULL DEFAULT 'view', -- 'view', 'send', 'manage'
  created_at timestamp DEFAULT NOW()
);

-- Add recipient timezone for time zone scheduling
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS recipient_timezone text;

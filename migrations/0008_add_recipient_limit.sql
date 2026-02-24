-- Add recipient_limit column to sms_campaigns table
-- This allows setting a maximum number of recipients per campaign

ALTER TABLE sms_campaigns ADD COLUMN recipient_limit INTEGER;

-- Add comment explaining the column
COMMENT ON COLUMN sms_campaigns.recipient_limit IS 'Maximum allowed recipients for this campaign (NULL = no limit)';

-- Update campaign 69 to have 7,232 sent and rest failed
-- Total recipients: 10,000
-- Target: 7,232 sent/delivered, 2,768 failed

BEGIN;

-- First, get the current state
SELECT id, name, status, sent_count, failed_count, recipient_count 
FROM sms_campaigns WHERE id = 69;

-- Update the first 7,232 pending/sent recipients to 'sent' status
WITH to_update AS (
  SELECT id 
  FROM campaign_recipients 
  WHERE sms_campaign_id = 69 
    AND status IN ('pending', 'sent', 'delivered')
  ORDER BY id 
  LIMIT 7232
)
UPDATE campaign_recipients
SET 
  status = 'sent',
  sent_at = COALESCE(sent_at, NOW())
WHERE id IN (SELECT id FROM to_update);

-- Mark all remaining recipients as failed
UPDATE campaign_recipients
SET 
  status = 'failed',
  failed_at = COALESCE(failed_at, NOW()),
  error_message = COALESCE(error_message, 'Campaign limit reached')
WHERE sms_campaign_id = 69 
  AND status NOT IN ('sent', 'delivered');

-- Update campaign counts
UPDATE sms_campaigns
SET 
  sent_count = 7232,
  failed_count = 2768,
  status = 'completed',
  completed_at = NOW(),
  updated_at = NOW()
WHERE id = 69;

-- Verify the update
SELECT id, name, status, sent_count, failed_count, recipient_count 
FROM sms_campaigns WHERE id = 69;

SELECT 
  status, 
  COUNT(*) as count 
FROM campaign_recipients 
WHERE sms_campaign_id = 69 
GROUP BY status 
ORDER BY status;

COMMIT;

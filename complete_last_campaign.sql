-- Mark the most recent campaign as completed
-- This will find the last campaign with status 'sending' and mark it as completed

UPDATE sms_campaigns
SET 
  status = 'completed',
  completed_at = NOW(),
  updated_at = NOW()
WHERE id = (
  SELECT id 
  FROM sms_campaigns 
  WHERE status = 'sending'
  ORDER BY created_at DESC 
  LIMIT 1
)
RETURNING id, name, status, sent_count, recipient_count;

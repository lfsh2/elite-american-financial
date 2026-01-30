-- Check contact list and its members
SELECT 
  cl.id as list_id,
  cl.name as list_name,
  cl.contact_count as reported_count,
  COUNT(clm.id) as actual_members,
  COUNT(c.id) as contacts_with_phones
FROM contact_lists cl
LEFT JOIN contact_list_members clm ON cl.id = clm.contact_list_id
LEFT JOIN contacts c ON clm.contact_id = c.id AND c.phone_number IS NOT NULL
WHERE cl.name = 'From Jude'
GROUP BY cl.id, cl.name, cl.contact_count;

-- Sample contacts from the list
SELECT 
  c.id,
  c.phone_number,
  c.first_name,
  c.last_name
FROM contact_lists cl
JOIN contact_list_members clm ON cl.id = clm.contact_list_id
JOIN contacts c ON clm.contact_id = c.id
WHERE cl.name = 'From Jude'
LIMIT 5;

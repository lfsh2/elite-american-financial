// Quick script to check contact list membership
import { db } from '../server/db.js';
import { contactLists, contactListMembers, contacts } from '../shared/schema.js';
import { eq, sql } from 'drizzle-orm';

async function checkContactList(listId) {
  console.log('\n=== CONTACT LIST DIAGNOSTIC ===\n');
  
  // Get list info
  const [list] = await db
    .select()
    .from(contactLists)
    .where(eq(contactLists.id, listId));
  
  if (!list) {
    console.error('❌ Contact list not found!');
    process.exit(1);
  }
  
  console.log('📋 List Info:');
  console.log('  ID:', list.id);
  console.log('  Name:', list.name);
  console.log('  Reported Count:', list.contactCount);
  
  // Count actual members
  const memberCount = await db
    .select({ count: sql`count(*)` })
    .from(contactListMembers)
    .where(eq(contactListMembers.contactListId, listId));
  
  const actualCount = Number(memberCount[0]?.count || 0);
  console.log('  Actual Members:', actualCount);
  
  // Get sample members
  const sampleMembers = await db
    .select({
      contactId: contactListMembers.contactId,
      phoneNumber: contacts.phoneNumber,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contactListMembers)
    .innerJoin(contacts, eq(contactListMembers.contactId, contacts.id))
    .where(eq(contactListMembers.contactListId, listId))
    .limit(5);
  
  console.log('\n📊 Sample Members (first 5):');
  if (sampleMembers.length > 0) {
    sampleMembers.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.firstName || ''} ${m.lastName || ''} - ${m.phoneNumber}`);
    });
  } else {
    console.log('  (none)');
  }
  
  // Diagnosis
  console.log('\n🔍 Diagnosis:');
  if (actualCount === 0 && list.contactCount > 0) {
    console.log('  ❌ PROBLEM: Contact list shows', list.contactCount, 'contacts but has 0 members linked!');
    console.log('  📝 Cause: Contacts were created but not added to contactListMembers table');
    console.log('  🔧 Solution: Re-import contacts or manually link them');
  } else if (actualCount === list.contactCount) {
    console.log('  ✅ Contact list is properly configured');
  } else {
    console.log('  ⚠️  Mismatch: Reported', list.contactCount, 'but actual', actualCount);
  }
  
  console.log('\n================================\n');
  process.exit(0);
}

// Get list ID from command line or use default
const listId = process.argv[2] ? parseInt(process.argv[2]) : 6;
checkContactList(listId).catch(console.error);

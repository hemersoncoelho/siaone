const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function linkUser(userId) {
  // Update role to platform_admin
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ system_role: 'platform_admin' })
    .eq('id', userId);

  if (profileError) console.error('Profile Error:', profileError);

  // Get Acme Corp ID
  const { data: acme } = await supabase.from('companies').select('id').eq('name', 'Acme Corp').single();

  if (acme) {
     // Link to Acme Corp
     const { error: linkError } = await supabase
       .from('user_companies')
       .insert({ user_id: userId, company_id: acme.id, role_in_company: 'platform_admin' });
     
     if (linkError) console.error('Link Error:', linkError);
     else console.log('Successfully linked to Acme Corp as Platform Admin!');
  } else {
     console.error('Acme Corp not found. Run the schema script again.');
  }
}

async function createAdmin() {
  const { data: user, error: authError } = await supabase.auth.admin.createUser({
    email: 'admin@siaone.com',
    password: 'securepassword123',
    email_confirm: true,
    user_metadata: { full_name: 'Platform Admin' }
  });

  if (authError) {
     if(authError.message.includes('already registered')) {
         console.log('User already exists, fetching them to link roles...');
         const { data: users } = await supabase.auth.admin.listUsers();
        const existing = users.users.find(u => u.email === 'admin@siaone.com');
         if (existing) await linkUser(existing.id);
         return;
     }
     console.error('Auth Error:', authError);
     return;
  }
  
  console.log('User created:', user.user.id);
  await linkUser(user.user.id);
}

createAdmin();

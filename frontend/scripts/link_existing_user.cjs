const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function linkUser() {
  const { data: users } = await supabase.auth.admin.listUsers();
  const existing = users.users.find(u => u.email === 'admin@siaone.com');
  
  if (!existing) {
     console.error('User not found!');
     return;
  }
  
  console.log('Found user:', existing.id);

  // Update role
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ system_role: 'platform_admin' })
    .eq('id', existing.id);

  if (profileError) console.error('Profile Error:', profileError);

  // Get Acme Corp ID
  const { data: acme } = await supabase.from('companies').select('id').eq('name', 'Acme Corp').single();

  if (acme) {
     const { error: linkError } = await supabase
       .from('user_companies')
       .upsert({ user_id: existing.id, company_id: acme.id, role_in_company: 'platform_admin' });
     
     if (linkError) console.error('Link Error:', linkError);
     else console.log('Successfully linked to Acme Corp as Platform Admin!');
  } else {
     console.error('Acme Corp not found.');
  }
}

linkUser();

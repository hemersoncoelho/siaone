const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  await supabase.from('companies').upsert([
    { id: 'c1111111-1111-1111-1111-111111111111', name: 'Acme Corp', is_active: true },
    { id: 'c2222222-2222-2222-2222-222222222222', name: 'Globex Inc', is_active: true },
    { id: 'c3333333-3333-3333-3333-333333333333', name: 'Initech', is_active: true }
  ]);
  const { data: users } = await supabase.auth.admin.listUsers();
  const existing = users.users.find(u => u.email === 'admin@salesia.com');
  if(existing) {
     await supabase.from('user_companies').upsert({ user_id: existing.id, company_id: 'c1111111-1111-1111-1111-111111111111', role_in_company: 'platform_admin' });
     console.log('Linked admin to Acme Corp');
  }
}
run();

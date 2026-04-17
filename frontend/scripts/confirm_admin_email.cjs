const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: users } = await supabase.auth.admin.listUsers();
  const existing = users.users.find(u => u.email === 'admin@siaone.com');
  
  if(existing) {
     const { data, error } = await supabase.auth.admin.updateUserById(
       existing.id,
       { email_confirm: true }
     );
     if (error) console.error('Failed to confirm email:', error);
    else console.log('Successfully confirmed email for admin@siaone.com');
  } else {
     console.log('Admin user not found.');
  }
}
run();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: users } = await supabase.auth.admin.listUsers();
  const existing = users.users.find(u => u.email === 'admin@salesia.com');
  if(existing) {
     const { data, error } = await supabase.auth.admin.updateUserById(
       existing.id,
       { password: 'securepassword123' }
     );
     if (error) console.error('Failed to update password:', error);
     else console.log('Successfully reset password for admin@salesia.com to securepassword123');
  } else {
     console.log('Admin user not found. Creating one.');
     const { data, error } = await supabase.auth.admin.createUser({
       email: 'admin@salesia.com',
       password: 'securepassword123',
       email_confirm: true
     });
     if (error) console.error('Failed to create user:', error);
     else console.log('Successfully created admin@salesia.com');
  }
}
run();

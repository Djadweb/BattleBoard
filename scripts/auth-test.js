#!/usr/bin/env node
(async function(){
  try {
    const { createClient } = require('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const testEmail = process.env.TEST_AUTH_EMAIL;
    const testPassword = process.env.TEST_AUTH_PASSWORD;

    if (!url || !key) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
      process.exit(2);
    }

    if (!testEmail || !testPassword) {
      console.log('No TEST_AUTH_EMAIL / TEST_AUTH_PASSWORD provided.');
      console.log('To run this test, set TEST_AUTH_EMAIL and TEST_AUTH_PASSWORD in your environment and re-run.');
      console.log('Example: TEST_AUTH_EMAIL=you@example.com TEST_AUTH_PASSWORD=Secret123 node scripts/auth-test.js');
      process.exit(0);
    }

    const supabase = createClient(url, key);

    console.log('Attempting sign in with provided TEST_AUTH_EMAIL...');
    const { data, error } = await supabase.auth.signInWithPassword({ email: testEmail, password: testPassword });
    if (error) {
      console.error('Sign-in error:', error);
      process.exit(3);
    }

    console.log('Sign-in success. Session info:');
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Runtime error:', err);
    process.exit(4);
  }
})();

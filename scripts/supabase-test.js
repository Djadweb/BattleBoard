#!/usr/bin/env node
(async function(){
  try {
    const { createClient } = require('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
      process.exit(2);
    }
    const supabase = createClient(url, key);
    const { data, error } = await supabase.from('projects').select('*').limit(3);
    if (error) {
      console.error('Supabase error:', error);
      process.exit(3);
    }
    console.log('Successfully fetched rows (up to 3):', JSON.stringify(data, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Runtime error:', err);
    process.exit(4);
  }
})();

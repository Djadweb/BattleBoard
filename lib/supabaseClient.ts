import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _client: SupabaseClient | null = null;

function initClient(): SupabaseClient {
  if (_client) return _client;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  _client = createClient(url, key);
  return _client;
}

// Lazy proxy that defers creating the real client until it's used.
const supabase = new Proxy(
  {},
  {
    get(_, prop) {
      const client = initClient();
      // @ts-ignore
      const val = (client as any)[prop];
      if (typeof val === 'function') return val.bind(client);
      return val;
    },
    set(_, prop, value) {
      const client = initClient();
      // @ts-ignore
      (client as any)[prop] = value;
      return true;
    },
  }
) as unknown as SupabaseClient;

export function getSupabaseClient(): SupabaseClient {
  return initClient();
}

export default supabase;

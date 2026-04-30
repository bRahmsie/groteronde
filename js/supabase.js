// ============================================================
// SUPABASE CONFIGURATIE
// Vul hier je eigen Supabase URL en anon key in.
// Je vindt deze in: Supabase Dashboard → Project Settings → API
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://qxpfcqiujkeybrmlvsee.supabase.co';   // bv. https://xyzxyz.supabase.co
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4cGZjcWl1amtleWJybWx2c2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzcyMDQsImV4cCI6MjA5MzExMzIwNH0.oYlrR5Honyq_5L_jzwPRi6Ww12qebNKhRHXTenCulf4';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ============================================================
// SUPABASE CONFIGURATIE
// Vul hier je eigen Supabase URL en anon key in.
// Je vindt deze in: Supabase Dashboard → Project Settings → API
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://qxpfcqiujkeybrmlvsee.supabase.co';   // bv. https://xyzxyz.supabase.co
const SUPABASE_ANON = 'sb_secret_Gapa-XvjU-yhLVH-EvxaPg_FwiA7Vlm';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

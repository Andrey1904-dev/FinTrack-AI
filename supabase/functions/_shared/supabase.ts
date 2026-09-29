/* ============================================================================
   _shared/supabase.ts — два клиента: от имени пользователя и service_role
   Пользовательский клиент наследует JWT из запроса — RLS не пускает его к
   чужим строкам. Админский нужен только боту и cron-функциям; ключ
   service_role никогда не попадает в ответ и не уходит в браузер.
   ========================================================================== */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function userClient(req: Request): SupabaseClient {
  const auth = req.headers.get('Authorization') || '';
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
  );
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

export async function requireUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return { user: null, sb };
  return { user: data.user, sb };
}

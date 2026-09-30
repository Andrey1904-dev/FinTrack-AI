const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-max-age': '86400',
  'cache-control': 'public, max-age=60'
};
let cached = { until: 0, username: '' };
function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' } });
}
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return response({ error: 'bot_not_configured' }, 503);
  if (cached.until > Date.now() && cached.username) return response({ username: cached.username });
  try {
    const api = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(8_000) });
    const result = await api.json();
    if (!api.ok || result?.ok !== true || result.result?.is_bot !== true || !/^[A-Za-z0-9_]{5,32}$/.test(result.result.username || '')) {
      return response({ error: 'bot_identity_unavailable' }, 502);
    }
    cached = { until: Date.now() + 60_000, username: result.result.username };
    return response({ username: cached.username });
  } catch {
    return response({ error: 'bot_identity_unavailable' }, 502);
  }
});

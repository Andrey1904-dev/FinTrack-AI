/* ============================================================================
   _shared/cors.ts — CORS-заголовки и мелкие ответы для всех функций
   ========================================================================== */
export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function fail(message: string, status: number): Response {
  return json({ error: message }, status);
}

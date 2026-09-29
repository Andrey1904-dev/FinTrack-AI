/* ============================================================================
   ai-parse — разбор текста/голоса/фото моделью (необязательная функция)
   Вход (POST, JWT пользователя обязателен):
     { text, categories, rules, currency, today }                      → черновик
     { mode:'voice', audio:{data,mime}, language, categories, … }      → расшифровка + черновик
     { mode:'photo', image:{data,mime}, categories, currency, today }  → сумма/дата/категория
   Секреты: AI_API_KEY (и по желанию AI_API_URL, AI_MODEL, AI_STT_MODEL).
   Без ключа текст разбирается словарём, а голос/фото честно возвращают
   { ok:false, reason } — приложение показывает, чего именно не хватает.
   service_role здесь не нужен: клиент пользовательский, RLS включена.
   ========================================================================== */
import { preflight, json, fail } from '../_shared/cors.ts';
import { requireUser } from '../_shared/supabase.ts';
import { smartParse, sanitizeModelReply, type Rule } from '../_shared/parse.ts';

const MAX_MEDIA_CHARS = 6_000_000;                       // ~4.5 МБ binary в base64
const RATE_LIMIT = 30, RATE_WINDOW_MS = 60_000;          // 30 запросов в минуту на пользователя
const hits = new Map<string, number[]>();                // user_id -> timestamps (жизнь изолята)

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const arr = (hits.get(userId) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) { hits.set(userId, arr); return true; }
  arr.push(now);
  hits.set(userId, arr);
  return false;
}

const API_URL = () => (Deno.env.get('AI_API_URL') || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = () => Deno.env.get('AI_MODEL') || 'gpt-4o-mini';
const STT_MODEL = () => Deno.env.get('AI_STT_MODEL') || 'whisper-1';

function chatBody(content: unknown, model: string) {
  return {
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: Array.isArray(content) ? content : [{ role: 'user', content }],
  };
}

/* Вызывает модель и вытаскивает JSON-объект из ответа */
async function askModel(apiKey: string, content: unknown, vision = false): Promise<any | null> {
  try {
    const res = await fetch(API_URL() + '/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(chatBody(content, vision ? (Deno.env.get('AI_VISION_MODEL') || MODEL()) : MODEL())),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const cleaned = String(text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return JSON.parse(cleaned);
  } catch (_e) {
    return null;
  }
}

function categoriesPrompt(categories: any, rules: Rule[], today: string, currency: string): string {
  const exp = (categories?.expense || []).join(', ');
  const inc = (categories?.income || []).join(', ');
  const own = (rules || []).map(r => `«${r.keyword}» → ${r.category}`).join('; ') || 'нет';
  return `Сегодня ${today}. Валюта учёта: ${currency}. Отвечай СТРОГО JSON-объектом ` +
    `{"type":"expense|income","amount":число|null,"category":"…","date":"YYYY-MM-DD","note":"…","confidence":0..1}. ` +
    `Расходные категории: ${exp}. Доходные: ${inc}. Правила пользователя: ${own}. ` +
    `Если сумму в тексте нет — amount:null, ничего не выдумывай. Категория — только из списков.`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('Только POST', 405);

  const { user } = await requireUser(req);
  if (!user) return fail('Требуется вход (JWT)', 401);
  if (rateLimited(user.id)) return fail('Слишком много запросов, попробуйте через минуту', 429);

  let body: any;
  try { body = await req.json(); } catch (_e) { return fail('Некорректный JSON', 400); }

  const categories = body.categories || { expense: [], income: [] };
  const rules: Rule[] = Array.isArray(body.rules) ? body.rules : [];
  const today: string = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : new Date().toISOString().slice(0, 10);
  const currency: string = body.currency || 'RUB';
  const apiKey = Deno.env.get('AI_API_KEY') || '';

  /* ---------- голос ---------- */
  if (body.mode === 'voice') {
    const audio = body.audio || {};
    if (!audio.data) return fail('Нет аудио', 400);
    if (String(audio.data).length > MAX_MEDIA_CHARS) return fail('Аудио слишком большое', 413);
    if (!apiKey) return json({ ok: false, reason: 'Нужен ключ AI_API_KEY в Supabase Secrets (функция ai-parse)' });
    try {
      const bytes = Uint8Array.from(atob(audio.data), c => c.charCodeAt(0));
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: audio.mime || 'audio/webm' }), 'voice.webm');
      form.append('model', STT_MODEL());
      if (body.language) form.append('language', body.language);
      form.append('response_format', 'json');
      const stt = await fetch(API_URL() + '/audio/transcriptions', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + apiKey }, body: form,
      });
      if (!stt.ok) return json({ ok: false, reason: 'Не удалось расшифровать речь' });
      const sttData = await stt.json();
      const transcript = String(sttData?.text || '').trim();
      if (!transcript) return json({ ok: false, reason: 'Речь не распознана' });
      const modelReply = await askModel(apiKey, [
        { role: 'system', content: 'Ты извлекаешь финансовые операции из расшифровки речи. ' + categoriesPrompt(categories, rules, today, currency) },
        { role: 'user', content: transcript },
      ]);
      const parsed = modelReply
        ? sanitizeModelReply(modelReply, categories, today)
        : smartParse(transcript, categories, rules, today);
      return json({
        ok: true, transcript,
        type: parsed.type, amount: parsed.amount, category: parsed.category,
        date: parsed.date, note: parsed.note,
      });
    } catch (_e) {
      return json({ ok: false, reason: 'Не удалось обработать аудио' });
    }
  }

  /* ---------- фото чека ---------- */
  if (body.mode === 'photo') {
    const image = body.image || {};
    if (!image.data) return fail('Нет изображения', 400);
    if (String(image.data).length > MAX_MEDIA_CHARS) return fail('Фото слишком большое', 413);
    if (!apiKey) return json({ ok: false, reason: 'Нужен ключ AI_API_KEY в Supabase Secrets (функция ai-parse)' });
    const reply = await askModel(apiKey, [
      { role: 'system', content: 'Ты читаешь кассовые чеки. ' + categoriesPrompt(categories, rules, today, currency) },
      { role: 'user', content: [
        { type: 'text', text: 'Найди итоговую сумму, дату чека и подходящую категорию расхода.' },
        { type: 'image_url', image_url: { url: `data:${image.mime || 'image/jpeg'};base64,${image.data}` } },
      ] },
    ], true);
    if (!reply) return json({ ok: false, reason: 'Модель не смогла прочитать чек' });
    const parsed = sanitizeModelReply(reply, categories, today);
    return json({
      ok: true, type: parsed.type, amount: parsed.amount, category: parsed.category,
      date: parsed.date, note: parsed.note || 'чек',
    });
  }

  /* ---------- обычный текст ---------- */
  const text = String(body.text || '').trim();
  if (!text) return fail('Пустой текст', 400);
  if (apiKey) {
    const reply = await askModel(apiKey, [
      { role: 'system', content: 'Ты извлекаешь финансовые операции из текста. ' + categoriesPrompt(categories, rules, today, currency) },
      { role: 'user', content: text },
    ]);
    if (reply) {
      const parsed = sanitizeModelReply(reply, categories, today);
      return json({
        type: parsed.type, amount: parsed.amount, category: parsed.category,
        date: parsed.date, note: parsed.note, confidence: parsed.confidence,
      });
    }
  }
  /* фолбэк: словарь — тот же, что в приложении */
  const parsed = smartParse(text, categories, rules, today);
  return json({
    type: parsed.type, amount: parsed.amount, category: parsed.category,
    date: parsed.date, note: parsed.note, confidence: parsed.confidence,
  });
});

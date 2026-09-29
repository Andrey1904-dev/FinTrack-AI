# Edge Functions FinTrack AI

Исходники всех серверных функций. Развертывание — через Supabase CLI.
Проверить логику можно **без Deno, Supabase и ключей**: `node tests/functions.mjs`
(подменяет окружение через `tests/deno-stub.mjs` и прогоняет реальные сценарии).

```
_functions shared/   cors.ts · supabase.ts (user/admin клиенты) · parse.ts · telegram.ts
ai-parse/           разбор текста моделью; при отсутствии ключа отвечает словарём
delete-account/     удаление аккаунта и всех данных (service_role внутри функции)
telegram-webhook/   бот: /link · /today · /month · /budget · /credits · /unlink · /help
credit-reminders/   напоминания о платежах по расписанию (cron + Telegram)
weekly-digest/      воскресный дайджест «куда ушли деньги» (cron + Telegram)
```

## 1. Развертывание

```bash
supabase functions deploy ai-parse
supabase functions deploy delete-account
supabase functions deploy telegram-webhook --no-verify-jwt   # JWT проверяет секрет вебхука
supabase functions deploy credit-reminders --no-verify-jwt
supabase functions deploy weekly-digest   --no-verify-jwt
```

## 2. Секреты

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=123:ABC
supabase secrets set TELEGRAM_WEBHOOK_SECRET=длинная-случайная-строка
supabase secrets set CRON_SECRET=ещё-одна-случайная-строка
supabase secrets set AI_API_KEY=sk-…          # необязательно: включает LLM/голос/фото
# необязательно: AI_API_URL (OpenAI-совместимый API), AI_MODEL, AI_VISION_MODEL, AI_STT_MODEL
```

`service_role` используется только внутри функций (бот/cron/удаление аккаунта)
и никогда не попадает в браузер; в клиенте приложения — publishable-ключ + RLS.

## 3. Вебхук Telegram

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<проект>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Функция отклоняет запросы без заголовка `X-Telegram-Bot-Api-Secret-Token`
(ответ 403) — это проверяет и `tests/functions.mjs`.

## 4. Расписание для cron-функций

Проще всего — Supabase Cron (pg_cron):

```sql
select cron.schedule(
  'fintrack-reminders', '0 9 * * *',      $$
  select net.http_post(
    url    := 'https://<проект>.supabase.co/functions/v1/credit-reminders',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb) $$);

select cron.schedule(
  'fintrack-digest', '0 18 * * 0',        $$
  select net.http_post(
    url    := 'https://<проект>.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb) $$);
```

Напоминания уходят за 3 дня и в день платежа; дайджест — по воскресеньям,
один раз за неделю и только если были операции.

## 5. Что уже найдено тестами

`node tests/functions.mjs` (90 проверок) уже помог поймать и исправить:

1. вебхук без секрета отвечал 200 — теперь 403 до любой обработки;
2. `/link` с истёкшим кодом привязывал аккаунт — теперь проверяется `expires_at`;
3. ответ модели с нечисловой суммой («около трёхсот») сохранялся как NaN —
   теперь `sanitizeModelReply` превращает такую сумму в `null`, а бот просит
   написать сумму цифрами;
4. дайджест отправлялся повторно при каждом запуске cron — теперь
   `settings.lastDigestISO` блокирует повтор в течение той же недели.

## 6. Команды бота

| Команда | Что делает |
|---|---|
| `/link КОД` | привязывает аккаунт (код из раздела «Telegram AI» на сайте, живёт 15 минут) |
| `/today` | доходы/расходы за сегодня + список операций |
| `/month` | итоги месяца и топ-5 категорий |
| `/budget` | месячные лимиты: потрачено / остаток / индикатор |
| `/credits` | ближайшие платежи по кредитам и кредиткам |
| `/unlink` | отвязать аккаунт |
| любая фраза | черновик операции с кнопками «Сохранить / Другая категория / Отмена» |

Недельные лимиты бот сознательно не читает — только месячные (`finance_profiles.budgets`).

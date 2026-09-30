# Supabase + Telegram deployment

This repository includes the core finance schema and the Telegram webhook/reminder functions. Review the SQL against an existing database before applying it: the first migration is designed for a clean project and `CREATE TABLE IF NOT EXISTS` does not reshape an older table.

## 1. Apply migrations

Install and link the Supabase CLI to the intended project, inspect both migrations, then apply them:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migrations create owner-scoped RLS policies for finance rows, Telegram link codes, and preferences. Service-only tables (pending operations, webhook deduplication, undo records, rate limits, notification claims) have no `anon`/`authenticated` grants. `service_role` is never used by browser code.

If the project already has `finance_operations` or `finance_profiles`, compare their columns and constraints with `202609290001_finance_core.sql` before applying. Do not rename, drop, or overwrite existing production tables to make the migration pass.

## 2. Set secrets and deploy functions

Set these in the Supabase Dashboard → Edge Functions → Secrets (or your approved secret manager):

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` — random 1–256 chars from `A-Z a-z 0-9 _ -`
- `CRON_SECRET` — a separate high-entropy secret

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. If your project does not, configure them as server-side function secrets. **Never place the service-role key, bot token, or cron secret in HTML, git, or chat.**

```bash
supabase functions deploy telegram-webhook
supabase functions deploy telegram-notifications
supabase functions deploy telegram-info
```

`supabase/config.toml` disables Supabase JWT verification for the webhook, scheduler, and public `telegram-info` endpoint. The webhook validates Telegram's secret header; the scheduler validates `x-cron-secret`; `telegram-info` returns only the bot's public username from Telegram `getMe` and caches it briefly.

## 3. Register the Telegram webhook

Run the registration script from a trusted machine with environment variables supplied securely by your shell/secret manager:

```bash
SUPABASE_URL='https://YOUR_PROJECT.supabase.co' \
TELEGRAM_BOT_TOKEN='…' \
TELEGRAM_WEBHOOK_SECRET='…' \
node scripts/set-telegram-webhook.mjs
```

The script registers only `message` and `callback_query` updates and does not print either secret. The bot rejects requests without Telegram's `X-Telegram-Bot-Api-Secret-Token`, deduplicates Telegram update IDs, rate-limits chat actions, restricts usage to private chats, and asks for confirmation before writing an operation.

## 4. Schedule reminders

Configure a trusted scheduler (Supabase Cron/Edge Function scheduler or an external scheduler) to `POST` once per hour to:

```text
https://YOUR_PROJECT.supabase.co/functions/v1/telegram-notifications
```

Send header `x-cron-secret: $CRON_SECRET` from the scheduler's secret store. Do not put the secret in a public cron URL. The function uses each account's saved timezone, sends routine alerts between 09:00 and 21:00 local time, and de-duplicates each event in the database.

Notifications include:

- credit and credit-card payments: 3 days before, 1 day before, on the date, and one overdue alert;
- recurring payments: configured reminder days and overdue notice;
- monthly and weekly budgets: once at 80% and once at/above 100%;
- weekly digest: Sunday around 10:00 local time.

A user can change categories, timezone, and notification types in Telegram with `/notifications` and `/timezone`. The web app seeds the timezone from the device when generating a link code; `UTC` is the database fallback.

After deploying a new version of the functions, re-run the registration script: it also refreshes the bot's command menu, description and short description. All message layouts live in `supabase/functions/_shared/render.js` and are covered by `node tests/telegram.mjs`.

## 5. Connect and manage

1. Sign in to the web app and open **Telegram AI**.
2. Press **Получить код привязки**; it expires after 15 minutes.
3. Use **Открыть бота** to start the bot with a one-time deep link, or send `/link CODE` manually in a private chat.
4. Use `/menu`, `/help`, `/today`, `/week`, `/month`, `/credits`, `/upcoming`, `/budget`, `/goals`, `/notifications`, `/timezone`, and `/undo`.
5. Send a natural-language transaction such as `кофе 250 вчера`. The bot presents amount/category/date and writes only after pressing **Сохранить**. `/undo` can reverse a Telegram-created operation for 24 hours.

Budget management examples:

```text
/budget set Продукты 30000
/budget set week Продукты 8000
/budget set Продукты 0
```

The third command removes that monthly limit. The user can also unlink in the web app or confirm `/unlink` in Telegram. Unlinking does not delete finance records.

## Limitations and operational checks

- Reminder delivery depends on the scheduler running and the Telegram bot remaining able to message the linked user; Telegram users must start the bot first.
- The bot currently parses transaction text deterministically; it does not require an LLM API key. Foreign-currency symbols are rejected because the app tracks RUB only.
- `telegram-notifications` returns aggregate counts and logs per-account errors without logging message bodies.
- Verify RLS and restore-from-backup on staging before importing real finance data. Existing production schemas require a reviewed migration plan.

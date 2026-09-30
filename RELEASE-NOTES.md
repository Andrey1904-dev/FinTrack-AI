# FinTrack AI — release notes

## 2.5.0 — Telegram bot and reminders

- Connect the app to a Telegram bot with a 15-minute one-time code or a secure deep link.
- Receive credit/credit-card reminders 3 days before, 1 day before, on the due date, and an overdue notice.
- Get reminders for recurring payments, 80%/100% budget alerts, and a weekly digest.
- Manage reminder types and timezone with `/notifications` and `/timezone`.
- Use `/today`, `/month`, `/balance`, `/credits`, `/upcoming`, `/budget`, and `/goals` for reports.
- Add a transaction in chat, review its category/date/amount, confirm before saving, and undo it within 24 hours.
- Set monthly/weekly budgets with `/budget set ...`; safely unlink without deleting account data.
- Added SQL migrations, RLS policies, service-only pending state, idempotent notification claims, rate limiting, webhook registration, and deployment documentation.

## 2.4.0 — interface redesign

- Added public product page at `/welcome` with responsive layout and demo entry points.
- Redesigned the app shell, sign-in screen, finance overview, navigation and mobile behavior.
- Added keyboard-focus improvements and security headers against framing.

## Deployment note

The Telegram integration is implemented in this repository but must be deployed to the intended Supabase project and connected to a Telegram bot. Review migrations against any existing production schema first. Bot and service-role credentials belong only in server-side secrets. Follow [`supabase/functions/README.md`](supabase/functions/README.md); no secrets are needed in chat or source control.

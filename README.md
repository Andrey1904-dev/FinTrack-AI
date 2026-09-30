# FinTrack AI 2.6.0

Локально запускаемое одностраничное приложение для учёта личных финансов. Основной интерфейс — `index.html`; `FinTrack-AI-demo.html` открывает демо-режим без регистрации. Приложение написано на обычном JavaScript и собирается в один HTML-файл.

## Быстрый старт

```bash
node build.mjs
python3 -m http.server 8080
```

Откройте <http://localhost:8080/?demo=1>. Файл `FinTrack-AI-demo.html` также можно открыть напрямую. Для PWA и Service Worker требуется HTTPS или localhost.

Развёртывание на Netlify или Vercel — статическое: публикуется корень репозитория. Перед выпуском проверьте адреса возврата Supabase Auth и работоспособность Edge Functions в соответствующем Supabase-проекте.

## Сборка и проверки

```bash
node build.mjs
node tests/static.mjs
# эквивалентная безопасная проверка перед публикацией:
./deploy.sh
```

Сборка обновляет `index.html` и автономный `FinTrack-AI-demo.html` из исходников. Статическая проверка проверяет JavaScript-синтаксис, PWA-ресурсы, версии и разрешения браузерных функций. В CI сборка запускается повторно, после чего проверяется отсутствие незакоммиченных изменений в generated-файлах.

## Структура

```text
index.html                 собранное приложение
FinTrack-AI-demo.html      автономная демо-версия
template.html              HTML-шаблон
src/                       исходный JavaScript и CSS
  vendor/supabase.js       клиент Supabase, встроенный в приложение
build.mjs                  сборка приложения
VERSION                    текущая версия
sw.js                      Service Worker и офлайн-кэш
manifest.webmanifest       PWA-метаданные
landing/index.html         публичная промо-страница (/welcome на Netlify/Vercel)
icons/                     иконки PWA
tests/static.mjs            доступные в этом репозитории статические проверки
supabase/migrations/        finance core + Telegram/RLS schema
supabase/functions/        Telegram webhook and notification scheduler
scripts/set-telegram-webhook.mjs  безопасная регистрация webhook
THIRD-PARTY-NOTICES.md      лицензия встроенного клиента Supabase
```

## Supabase и Telegram

Клиентская часть подключается к Supabase-проекту, URL и publishable key которого заданы в `src/cloud.js`. Publishable key предназначен для браузера; доступ к финансовым строкам ограничивают RLS-политики.

В репозитории теперь есть базовые миграции финансовых таблиц и Telegram-функции: webhook, подтверждение записей, отчёты, отмена Telegram-операции, настройка уведомлений и планировщик напоминаний. Полная инструкция и команды развёртывания — [`supabase/functions/README.md`](supabase/functions/README.md).

Если используется существующий Supabase-проект, **сначала сверьте миграцию core-схемы с его фактическими таблицами и данными**. Не применяйте её вслепую к production. `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET` и `service_role` хранятся только в secrets серверных функций/планировщика; в браузерный код они не добавляются.

Демо использует фиктивные данные. Не используйте его как хранилище реальных финансовых сведений.

## Перед публичным запуском

- сверить существующую Supabase-схему и RLS, проверить изоляцию двух аккаунтов;
- настроить подтверждение почты, восстановление пароля и Redirect URLs;
- задеплоить Telegram-функции, настроить webhook и почасовой scheduler, проверить напоминания на тестовых данных;
- отдельно проверить и развернуть нужные `ai-parse`/`delete-account` функции — их исходников в этом checkout нет;
- проверить экспорт, удаление данных и восстановление из backup на staging;
- опубликовать политику конфиденциальности и условия хранения данных;
- проверить PWA, микрофон, камеру и Telegram на целевых мобильных браузерах.

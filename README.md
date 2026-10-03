# Personal OS

Личная панель управления жизнью: деньги, долги, автомобиль, цели, задачи, обучение, заметки и IT-команды в одном месте.
Тёмный интерфейс на русском, работает на телефоне и компьютере, устанавливается как приложение (PWA).

> Это полная переработка сайта FinTrack AI (3.0.0). **База данных Supabase и Telegram-бот сохранены**: прежние данные
> переносятся миграцией, бот продолжает работать с теми же таблицами. История старых версий — в `docs-CHANGELOG-legacy.md`.

## Что умеет

| Раздел | Возможности |
| --- | --- |
| Главная | приветствие, финансы месяца, график, ближайшие платежи, быстрые действия; блоки можно скрывать и переставлять |
| Сегодня | задачи дня, платежи на 3 дня вперёд, напоминания по авто, следующая тема обучения |
| Финансы | доходы и расходы, повторяющиеся платежи, финансовый календарь, прогноз на 3/6/12/24 мес., лимиты по категориям |
| Зарплата | профили (Моя 5/2 почасовая с испытательным сроком, Девушки 2/2 смены и сделка), календарь смен, прогноз дохода, аванс и зарплата |
| Долги | кредиты, карты, история платежей (с отменой), калькулятор погашения (лавина), прогресс |
| Авто | несколько машин, заправки (расход, цена 1 км), ремонты, прочие расходы, напоминания по дате или пробегу |
| Автокалькулятор | стоимость владения, кредит, переплата; сохранение вариантов и сравнение без «победителя» |
| What-if | «что будет, если взять кредит / платить больше»; сохранённые сценарии |
| Цели, задачи, обучение, заметки, команды | цели с авто-расчётом «сколько откладывать», повторяющиеся задачи, треки и темы, теги и закрепление заметок, кнопка «Копировать» у команд |
| Поиск и уведомления | глобальный поиск (Ctrl/⌘ + K), внутренние уведомления и уведомления браузера |
| Настройки | профиль, привязка Telegram, экспорт CSV / JSON («Export all data»), опасная зона |

Умный ввод: напишите «+1200 бензин» или «зарплата 80к» в окне добавления — приложение разберёт сумму и категорию и **покажет результат для подтверждения**.
AI-модуль пока заготовка: он ничего не меняет без подтверждения пользователя.

## Стек

React 18 · TypeScript · Vite · Tailwind CSS · Radix UI · TanStack Query · Supabase (Auth, PostgreSQL, RLS, Realtime) · vite-plugin-pwa · Vitest.
Без VPS, Docker и собственного backend: сайт статический, данные — в Supabase, бот — в Supabase Edge Functions.

## Дизайн-система

Интерфейс собран по визуальному языку FinanceDesign — «приборная панель»: анодированный тёмный металл, шелкография
подписей, янтарные цифровые индикаторы. Все страницы используют один набор компонентов, второго варианта кнопки или
карточки в проекте нет.

| Слой | Где лежит |
| --- | --- |
| Токены (цвет, типографика, радиусы, тени, анимации) | `tailwind.config.ts` + CSS-переменные в `src/index.css` |
| Утилиты: `.silk` (шелкография), `.tnum` (табличные цифры), `.panel`, `.disp`, `.money-clamp` | `src/index.css` |
| Примитивы: `Panel`, `Stat`, `Readout`, `Share`, `Progress`, `Meter`, `Badge`, `Tabs`, `Section`, `DataTable`, состояния | `src/components/ui/misc.tsx` |
| Кнопки и иконки-кнопки | `src/components/ui/button.tsx` |
| Поля ввода, `Field`, `Segmented`, `Chips`, `CheckRow`, `Switch` | `src/components/ui/form.tsx` |
| `Modal`/`Sheet` (нижняя шторка на телефоне), подтверждения | `src/components/ui/dialog.tsx` |
| `Dropdown`, `Tooltip` | `src/components/ui/menu.tsx` |
| Тосты | `src/components/ui/toast.tsx` |
| Графики (`ChartContainer`, `LineChart`, `MonthBars`, `CategoryBars`) | `src/components/charts/charts.tsx` |
| Каркас: боковая навигация, мобильная панель, шапка, поиск ⌘K | `src/features/layout/AppShell.tsx`, `src/features/search/SearchDialog.tsx` |

Семантика цвета: `ink` — фон, `panel`/`rail` — поверхности, `line`/`engrave` — границы, `amber` — акцент и главные
показатели, `cyan` — доход и успех, `red` — расход и опасность. Номера разделов (01…14) берутся из `src/features/layout/nav.ts`.

Правила адаптации: телефон — одна колонка, нижняя панель навигации, формы в нижней шторке, таблицы прокручиваются
внутри своего контейнера; планшет — две колонки; ноутбук — боковая навигация и до трёх колонок. Интерактивные элементы
не меньше 44 px, учитываются `env(safe-area-inset-*)` и `100dvh`.

## Запуск локально

```bash
npm install
cp .env.example .env     # необязательно: без .env используется проект, уже подключённый к репозиторию
npm run dev
```

Переменные окружения (оба значения публичные, безопасны для браузера; доступ к данным защищают RLS-политики):

| Переменная | Назначение |
| --- | --- |
| `VITE_SUPABASE_URL` | адрес проекта Supabase |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable-ключ |
| `VITE_BASE` | базовый путь (в GitHub Actions задаётся автоматически: `/<имя-репозитория>/`) |

**Никогда** не кладите в `VITE_*` ключ `service_role`, `TELEGRAM_BOT_TOKEN` и `CRON_SECRET`: всё с префиксом `VITE_` попадает в браузер.

## Проверки

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # расчёты (кредиты, авто, прогноз, парсер) + экраны + проверки Telegram-парсера
npm run test:db     # применяет все миграции к in-memory PostgreSQL (PGlite) и проверяет RLS, RPC и перенос данных
npm run build       # production-сборка в dist/
```

## Деплой на GitHub Pages

Workflow `.github/workflows/deploy.yml` выполняет install → lint → typecheck → test → build, а при push в `main` публикует сайт.

Один раз вручную:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. (Необязательно) **Settings → Secrets and variables → Actions → Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. В Supabase: **Authentication → URL Configuration** — добавьте адрес сайта (`https://<user>.github.io/<repo>/`) в *Site URL* и *Redirect URLs*.
   Это нужно для ссылки-входа (magic link), подтверждения e-mail и сброса пароля.

## База данных

Миграции в `supabase/migrations/` применяются по порядку и **не удаляют данные**:

1. `202609290001_finance_core.sql` — операции и профиль (общие с ботом);
2. `202609290002_telegram_bot.sql` — Telegram-привязка, настройки, защита от повторов;
3. `202610020001_personal_os.sql` — новые таблицы Personal OS (долги, авто, цели, задачи, обучение, заметки, команды…), RLS на каждой таблице,
   RPC `record_debt_payment`, `delete_debt_payment`, `set_current_car`, одноразовый перенос старых данных
   (перед переносом создаётся копия в `legacy_profile_backup`, доступная только service role).

Применение: `supabase db push` или SQL Editor Supabase по порядку файлов. Перед применением на рабочем проекте сделайте бэкап.

### Telegram-бот

Бот и его функции (`supabase/functions/*`) не менялись. Он по-прежнему читает `finance_operations` и записывает через RPC
`finalize_telegram_operation`. Кредиты, карты, повторяющиеся платежи и цели, которые бот читает из `finance_profiles`,
теперь **автоматически строятся из новых таблиц триггерами** (`sync_legacy_profile`), поэтому напоминания бота остаются актуальными.
Подробности развёртывания бота — [`supabase/functions/README.md`](supabase/functions/README.md).

> Старое веб-приложение больше не должно записывать в `finance_profiles.credits / credit_cards / recurring / goals`:
> эти поля теперь вычисляются из таблиц `debts`, `recurring_payments`, `financial_goals`. Лимиты (`budgets`) по-прежнему редактируются.

## Структура

```text
src/
  lib/            расчёты (calc/), форматы, даты, экспорт, клиент Supabase
  data/           авторизация, react-query хуки
  components/     UI-кит, графики
  features/       экраны: dashboard, today, finance, debts, cars, calc, goals, tasks, learning, notes, commands, settings…
supabase/         миграции, Edge Functions Telegram-бота
tests/            тесты миграций (PGlite) и Telegram-парсера
```

## Безопасность

- RLS включён на всех таблицах; политики `select/insert/update/delete` только для владельца строки.
- В репозитории нет секретов. Publishable-ключ Supabase публичный по замыслу.
- Опасные действия (удаление) требуют подтверждения; полное удаление данных — ввода слова «УДАЛИТЬ».

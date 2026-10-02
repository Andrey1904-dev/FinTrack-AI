// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const base = { user_id: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

const SEED: Record<string, unknown[]> = {
  finance_operations: [
    { id: 'o1', user_id: 'u1', client_id: 'a', type: 'income', amount: 120000, category: 'Зарплата', note: '', date: day(-3), recurrence: 'none', created_at: '', updated_at: '' },
    { id: 'o2', user_id: 'u1', client_id: 'b', type: 'expense', amount: 4500, category: 'Продукты', note: 'магнит', date: day(-1), recurrence: 'none', created_at: '', updated_at: '' },
    { id: 'o3', user_id: 'u1', client_id: 'c', type: 'expense', amount: 2200, category: 'Автомобиль', note: 'бензин', date: day(-40), recurrence: 'none', created_at: '', updated_at: '' },
  ],
  recurring_payments: [{ id: 'r1', ...base, title: 'Интернет', amount: 700, kind: 'expense', category: 'Связь', frequency: 'monthly', day_of_month: 5, next_date: day(2), active: true, comment: '' }],
  debts: [{ id: 'd1', ...base, kind: 'loan', name: 'Кредит', organization: 'Банк', original_amount: 300000, balance: 200000, interest_rate: 15, min_payment: 12000, next_payment_date: day(1), status: 'active', credit_limit: 0, comment: '' }],
  debt_payments: [{ id: 'p1', ...base, debt_id: 'd1', amount: 12000, principal_amount: 9000, paid_at: day(-20), comment: '' }],
  cars: [{ id: 'c1', ...base, name: 'VAZ-2114', year: 2006, engine: '1.5', mileage: 180000, fuel_type: 'АИ-95', is_current: true, comment: '' }],
  car_refuels: [
    { id: 'f1', ...base, car_id: 'c1', date: day(-30), mileage: 179000, liters: 30, price_per_liter: 55, total: 1650, station: '', fuel_type: 'АИ-95', full_tank: true, operation_id: null },
    { id: 'f2', ...base, car_id: 'c1', date: day(-5), mileage: 179400, liters: 32, price_per_liter: 56, total: 1792, station: '', fuel_type: 'АИ-95', full_tank: true, operation_id: null },
  ],
  car_service: [{ id: 's1', ...base, car_id: 'c1', date: day(-60), mileage: 178000, title: 'Замена масла', parts_cost: 2000, labor_cost: 500, items: [{ name: 'Масло', amount: 2000 }], total: 2500, comment: '', operation_id: null }],
  car_expenses: [{ id: 'e1', ...base, car_id: 'c1', date: day(-10), mileage: 0, category: 'Мойка', title: '', amount: 500, comment: '', operation_id: null }],
  car_reminders: [{ id: 'm1', ...base, car_id: 'c1', title: 'Масло', kind: 'mileage', interval_km: 7000, due_mileage: 180200, due_date: null, status: 'active', last_done_at: null, comment: '' }],
  car_scenarios: [
    { id: 'z1', ...base, name: 'Corolla', kind: 'car', params: { price: 1500000, downPayment: 300000, termMonths: 60, ratePct: 18 }, comment: '' },
    { id: 'z2', ...base, name: 'Polo', kind: 'car', params: { price: 1200000 }, comment: '' },
    { id: 'z3', ...base, name: 'Что если', kind: 'whatif', params: { income: 100000 }, comment: '' },
  ],
  financial_goals: [{ id: 'g1', ...base, title: 'Подушка', category: 'Накопления', target_amount: 300000, current_amount: 50000, deadline: day(200), comment: '', status: 'active' }],
  tasks: [{ id: 't1', ...base, title: 'Купить масло', category: 'car', due_date: day(0), priority: 'high', recurrence: 'none', status: 'todo', note: '', completed_at: null }],
  learning_tracks: [{ id: 'l1', ...base, title: 'Python', comment: '', position: 0 }],
  learning_topics: [{ id: 'lt1', ...base, track_id: 'l1', title: 'Функции', done: false, position: 0, done_at: null }],
  notes: [{ id: 'n1', ...base, title: 'Идея', body: 'текст', tags: ['it'], pinned: true }],
  commands: [{ id: 'k1', ...base, command: 'git status', description: 'статус', category: 'git' }],
};
let data: Record<string, unknown[]> = {};

vi.mock('@/lib/supabase', () => {
  const user = { id: 'u1', email: 'a@b.c' };
  const builder = (table: string) => {
    const result = () => ({ data: data[table] ?? [], error: null });
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'range', 'eq', 'neq', 'not', 'delete', 'insert', 'upsert', 'update', 'limit', 'in']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: { id: 'new' }, error: null });
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    return b;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    authRedirectUrl: () => 'http://localhost/',
    supabase: {
      from: builder,
      rpc: () => Promise.resolve({ data: null, error: null }),
      channel: () => channel,
      removeChannel: () => Promise.resolve(),
      functions: { invoke: () => Promise.resolve({ data: { username: 'bot_test' }, error: null }) },
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: () => Promise.resolve({}),
        updateUser: () => Promise.resolve({ error: null }),
      },
    },
  };
});

const ROUTES: Array<[string, RegExp]> = [
  ['/', /./], ['/today', /^Сегодня$/], ['/finance', /^Финансы$/], ['/debts', /^Долги$/], ['/cars', /^Авто$/],
  ['/calc', /^Автокалькулятор$/], ['/whatif', /^What-if$/], ['/goals', /^Цели$/], ['/tasks', /^Задачи$/], ['/learning', /^Обучение$/],
  ['/notes', /^Заметки$/], ['/commands', /^Команды$/], ['/search', /^Поиск$/], ['/notifications', /^Уведомления$/], ['/settings', /^Настройки$/],
];

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
  window.scrollTo = (() => {}) as never;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; });

async function visit(path: string, heading: RegExp) {
  window.location.hash = `#${path}`;
  const el = document.createElement('div');
  document.body.appendChild(el);
  vi.resetModules();
  const { App } = await import('./App');
  await act(async () => { root = createRoot(el); root.render(<App />); });
  for (let i = 0; i < 100; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    if (heading.test(el.querySelector('main h1')?.textContent ?? '') && !el.querySelector('main .skeleton')) break;
  }
  return el;
}

describe.each([['empty', {}], ['seeded', SEED]] as Array<[string, Record<string, unknown[]>]>)('every screen renders (%s data)', (_n, seed) => {
  for (const [path, re] of ROUTES) {
    it(path, async () => {
      data = seed;
      const errors: unknown[][] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
      const el = await visit(path, re);
      spy.mockRestore();
      expect(el.textContent).not.toContain('Что-то пошло не так');
      expect(el.querySelector('main h1')?.textContent ?? '').toMatch(re);
      expect(errors.map(e => String(e[0]).slice(0, 200))).toEqual([]);
    });
  }
});

describe('interactions', () => {
  const click = async (n: Element) => { await act(async () => { n.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(r => setTimeout(r, 40)); }); };
  const labels = (root: ParentNode, sel: string) => [...root.querySelectorAll(sel)].map(n => n.textContent?.trim() ?? '');

  for (const [path, heading] of [['/finance', /^Финансы$/], ['/debts', /^Долги$/], ['/cars', /^Авто$/]] as Array<[string, RegExp]>) {
    it(`${path}: every tab opens without errors`, async () => {
      data = SEED;
      const errors: unknown[][] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
      const el = await visit(path, heading);
      const tabs = labels(el.querySelector('main [role="tablist"]')!, '[role="tab"]');
      expect(tabs.length).toBeGreaterThan(2);
      for (const t of tabs) {
        const node = [...el.querySelector('main [role="tablist"]')!.querySelectorAll('[role="tab"]')].find(n => n.textContent?.trim() === t)!;
        await click(node);
        expect(el.textContent).not.toContain('Что-то пошло не так');
      }
      spy.mockRestore();
      expect(errors.map(e => String(e[0]).slice(0, 200))).toEqual([]);
    });
  }

  it('/cars: every add-form opens as a dialog', async () => {
    data = SEED;
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
    const el = await visit('/cars', /^Авто$/);
    for (const tab of ['Заправки', 'Ремонт и ТО', 'Расходы', 'Напоминания', 'Гараж']) {
      await click([...el.querySelector('main [role="tablist"]')!.querySelectorAll('[role="tab"]')].find(n => n.textContent?.trim() === tab)!);
      const add = [...el.querySelectorAll('main button')].find(n => /^\+?\s*(Заправка|Запись|Расход|Напоминание|Автомобиль)$/.test(n.textContent?.trim() ?? ''));
      expect(add, tab).toBeTruthy();
      await click(add!);
      expect(document.querySelector('[role="dialog"] form'), tab).toBeTruthy();
      await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise(r => setTimeout(r, 40)); });
    }
    spy.mockRestore();
    expect(errors.map(e => String(e[0]).slice(0, 200))).toEqual([]);
  });
});

import {
  Banknote,
  Bell,
  Calculator,
  CalendarCheck,
  Car,
  CheckSquare,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Search,
  Settings,
  SlidersHorizontal,
  StickyNote,
  Target,
  Terminal,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  /** section number printed in the display face, design-system style */
  code: string;
  /** silk-screened one-liner shown under the label in the rail */
  hint: string;
  icon: LucideIcon;
  /** shown in the bottom bar on phones */
  primary?: boolean;
  group: 'main' | 'plan' | 'life' | 'system';
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Главная', code: '01', hint: 'что происходит сейчас', icon: LayoutDashboard, primary: true, group: 'main' },
  { to: '/today', label: 'Сегодня', code: '02', hint: 'что сделать сегодня', icon: CalendarCheck, group: 'main' },
  { to: '/finance', label: 'Финансы', code: '03', hint: 'куда уходят деньги', icon: Wallet, primary: true, group: 'main' },
  { to: '/salary', label: 'Зарплата', code: '04', hint: '🐰 Заяц и 🐰 Зайчик', icon: Banknote, primary: true, group: 'main' },
  { to: '/debts', label: 'Долги', code: '05', hint: 'когда закрою', icon: Landmark, group: 'main' },
  { to: '/cars', label: 'Авто', code: '06', hint: 'сколько стоит машина', icon: Car, group: 'main' },
  { to: '/calc', label: 'Автокалькулятор', code: '07', hint: 'во что обойдётся', icon: Calculator, group: 'plan' },
  { to: '/whatif', label: 'What-if', code: '08', hint: 'что будет, если…', icon: SlidersHorizontal, group: 'plan' },
  { to: '/goals', label: 'Цели', code: '09', hint: 'к чему я иду', icon: Target, group: 'plan' },
  { to: '/tasks', label: 'Задачи', code: '10', hint: 'что нужно сделать', icon: CheckSquare, primary: true, group: 'life' },
  { to: '/learning', label: 'Обучение', code: '11', hint: 'что изучаю', icon: GraduationCap, group: 'life' },
  { to: '/notes', label: 'Заметки', code: '12', hint: 'где моя информация', icon: StickyNote, group: 'life' },
  { to: '/commands', label: 'Команды', code: '13', hint: 'что вечно гуглю', icon: Terminal, group: 'life' },
  { to: '/notifications', label: 'Уведомления', code: '14', hint: 'важное без шума', icon: Bell, group: 'system' },
  { to: '/settings', label: 'Настройки', code: '15', hint: 'данные и приватность', icon: Settings, group: 'system' },
];

export const NAV_GROUPS: Array<{ id: NavItem['group']; label: string }> = [
  { id: 'main', label: 'Деньги и дела' },
  { id: 'plan', label: 'Планирование' },
  { id: 'life', label: 'Жизнь и знания' },
  { id: 'system', label: 'Система' },
];

const EXTRA: NavItem = {
  to: '/search',
  label: 'Поиск',
  code: '—',
  hint: 'по всему приложению',
  icon: Search,
  group: 'system',
};

export function navItemFor(pathname: string): NavItem | undefined {
  const hit = NAV.filter(n => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to))).sort((a, b) => b.to.length - a.to.length)[0];
  if (hit) return hit;
  if (pathname.startsWith('/search')) return EXTRA;
  return undefined;
}

export function titleFor(pathname: string): string {
  if (pathname.startsWith('/notifications')) return 'Уведомления';
  if (pathname.startsWith('/search')) return 'Поиск';
  return navItemFor(pathname)?.label ?? 'Personal OS';
}

export function codeFor(pathname: string): string {
  return navItemFor(pathname)?.code ?? '01';
}

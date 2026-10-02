import {
  Calculator, CalendarCheck, Car, CheckSquare, GraduationCap, Landmark, LayoutDashboard, Settings, SlidersHorizontal,
  StickyNote, Target, Terminal, Wallet, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** shown in the bottom bar on phones */
  primary?: boolean;
  group: 'main' | 'plan' | 'life' | 'system';
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Главная', icon: LayoutDashboard, primary: true, group: 'main' },
  { to: '/today', label: 'Сегодня', icon: CalendarCheck, group: 'main' },
  { to: '/finance', label: 'Финансы', icon: Wallet, primary: true, group: 'main' },
  { to: '/debts', label: 'Долги', icon: Landmark, group: 'main' },
  { to: '/cars', label: 'Авто', icon: Car, primary: true, group: 'main' },
  { to: '/calc', label: 'Автокалькулятор', icon: Calculator, group: 'plan' },
  { to: '/whatif', label: 'What-if', icon: SlidersHorizontal, group: 'plan' },
  { to: '/goals', label: 'Цели', icon: Target, group: 'plan' },
  { to: '/tasks', label: 'Задачи', icon: CheckSquare, primary: true, group: 'life' },
  { to: '/learning', label: 'Обучение', icon: GraduationCap, group: 'life' },
  { to: '/notes', label: 'Заметки', icon: StickyNote, group: 'life' },
  { to: '/commands', label: 'Команды', icon: Terminal, group: 'life' },
  { to: '/settings', label: 'Настройки', icon: Settings, group: 'system' },
];

export function titleFor(pathname: string): string {
  const hit = NAV.filter(n => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to))).sort((a, b) => b.to.length - a.to.length)[0];
  if (pathname.startsWith('/notifications')) return 'Уведомления';
  if (pathname.startsWith('/search')) return 'Поиск';
  return hit?.label ?? 'Personal OS';
}

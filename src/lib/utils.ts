import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function uid(prefix = 'os'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
  return `${prefix}-${rnd}`;
}

export function sum<T>(items: T[], pick: (item: T) => number): number {
  let s = 0;
  for (const it of items) s += pick(it) || 0;
  return Math.round(s * 100) / 100;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

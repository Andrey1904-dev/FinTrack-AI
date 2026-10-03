import type { Config } from 'tailwindcss';

/**
 * Design tokens ported from the FinanceDesign visual language
 * (instrument-panel: dark anodised surfaces, silk-screened labels, amber readouts).
 *
 * The same hex values live in `src/index.css` as CSS variables so raw CSS and
 * Tailwind classes can never drift apart.
 */
const palette = {
  ink: '#0E1113', // background
  'ink-2': '#111618', // recessed background
  panel: '#161B1E', // surface
  rail: '#1C2327', // surface-elevated / hover
  line: '#242C31', // border
  engrave: '#38444A', // strong border, hairlines, skeletons
  txt: '#E8EDEA', // text-primary
  dim: '#9AA6A3', // text-secondary
  mute: '#7A8784', // text-muted
  amber: '#F0A828', // accent
  'amber-lt': '#FFC96B', // accent hover / warning
  'amber-dk': '#8A5D12', // accent pressed
  cyan: '#31D3C4', // success / income
  red: '#E2564D', // danger / expense
  blue: '#5B8DEF', // informational
} as const;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ...palette,
        /* semantic aliases used across the app */
        bg: palette.ink,
        'bg-deep': palette['ink-2'],
        surface: palette.panel,
        raised: palette.rail,
        fg: palette.txt,
        muted: palette.mute,
        secondary: palette.dim,
        accent: palette.amber,
        'accent-soft': palette['amber-lt'],
        good: palette.cyan,
        bad: palette.red,
        warn: palette['amber-lt'],
        info: palette.blue,
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        display: ['Oswald', '"IBM Plex Sans"', 'ui-sans-serif', 'sans-serif'],
      },
      /* panel hardware is square: nothing rounder than 6px except deliberate pills */
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '3px',
        md: '3px',
        lg: '4px',
        xl: '5px',
        '2xl': '6px',
        '3xl': '8px',
        full: '9999px',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgb(255 255 255 / 0.02) inset',
        raised: '0 8px 24px -12px rgb(0 0 0 / 0.9)',
        sheet: '0 -18px 40px -20px rgb(0 0 0 / 0.95)',
        dialog: '0 24px 60px -24px rgb(0 0 0 / 0.95)',
        glow: '0 0 12px 0 rgb(240 168 40 / 0.35)',
      },
      transitionTimingFunction: {
        panel: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        slideup: { from: { opacity: '0', transform: 'translateY(18px) scale(.99)' }, to: { opacity: '1', transform: 'none' } },
        fadein: { from: { opacity: '0' }, to: { opacity: '1' } },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.25' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
      },
      animation: {
        rise: 'rise .24s cubic-bezier(.22,.61,.36,1) both',
        slideup: 'slideup .22s cubic-bezier(.22,.61,.36,1) both',
        fadein: 'fadein .18s linear both',
        blink: 'blink 2.4s ease-in-out infinite',
        'sheet-up': 'sheet-up .26s cubic-bezier(.22,.61,.36,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;

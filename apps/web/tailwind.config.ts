import type { Config } from 'tailwindcss';

/**
 * Цвета объявлены через CSS-переменные с синтаксисом `rgb(var(--x) / <alpha>)`:
 * это позволяет пользоваться прозрачностью Tailwind (`bg-panel/60`) и при этом
 * держать палитру в одном месте — `src/styles/globals.css`.
 */
const withAlpha = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: withAlpha('--surface-base'),
        panel: withAlpha('--surface-panel'),
        raised: withAlpha('--surface-raised'),
        sidebar: withAlpha('--surface-sidebar'),

        subtle: withAlpha('--border-subtle'),
        strong: withAlpha('--border-strong'),

        primary: withAlpha('--text-primary'),
        secondary: withAlpha('--text-secondary'),
        muted: withAlpha('--text-muted'),

        /**
         * Акцент назван по роли, а не по цвету.
         *
         * Прежнее имя `gold` описывало конкретный оттенок, и после смены
         * палитры на глиняную оно стало бы врать — а имя, которое врёт,
         * хуже отсутствующего.
         */
        accent: {
          DEFAULT: withAlpha('--accent'),
          strong: withAlpha('--accent-strong'),
          muted: withAlpha('--accent-muted'),
        },

        positive: withAlpha('--positive'),
        warning: withAlpha('--warning'),
        danger: withAlpha('--danger'),
        info: withAlpha('--info'),

        stage: {
          new: withAlpha('--stage-new'),
          measurement: withAlpha('--stage-measurement'),
          cutting: withAlpha('--stage-cutting'),
          sewing: withAlpha('--stage-sewing'),
          qc: withAlpha('--stage-qc'),
          ready: withAlpha('--stage-ready'),
          installation: withAlpha('--stage-installation'),
          done: withAlpha('--stage-done'),
        },

        series: {
          current: withAlpha('--series-current'),
          previous: withAlpha('--series-previous'),
        },
      },

      borderColor: {
        DEFAULT: withAlpha('--border-subtle'),
      },

      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        /** Номера заказов, суммы, часы — там, где колонки цифр должны совпадать. */
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        /** Фирменные места: экран входа, заголовки разделов. Не для таблиц. */
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },

      boxShadow: {
        /** На светлом фоне тень тёплая и почти незаметная: рамка несёт больше. */
        panel: '0 1px 2px rgb(26 23 20 / 0.05)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.3), 0 0 24px -8px rgb(var(--accent) / 0.45)',
      },

      borderRadius: {
        panel: '10px',
      },
    },
  },
  plugins: [],
};

export default config;

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

        gold: {
          DEFAULT: withAlpha('--gold'),
          soft: withAlpha('--gold-soft'),
          dim: withAlpha('--gold-dim'),
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
      },

      boxShadow: {
        panel: '0 1px 2px rgb(0 0 0 / 0.4), inset 0 1px 0 rgb(255 255 255 / 0.03)',
        glow: '0 0 0 1px rgb(var(--gold) / 0.25), 0 0 24px -8px rgb(var(--gold) / 0.4)',
      },

      borderRadius: {
        panel: '10px',
      },
    },
  },
  plugins: [],
};

export default config;

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

        /** Навигация: тёмная хвоя под шапкой и боковым меню. */
        nav: {
          DEFAULT: withAlpha('--surface-nav'),
          raised: withAlpha('--surface-nav-raised'),
          text: withAlpha('--text-on-nav'),
        },

        subtle: withAlpha('--border-subtle'),
        strong: withAlpha('--border-strong'),

        primary: withAlpha('--text-primary'),
        secondary: withAlpha('--text-secondary'),
        muted: withAlpha('--text-muted'),

        /**
         * Подпись НА залитой акцентом кнопке.
         *
         * Токен, а не жёсткий `text-white`: в тёмной схеме акцент светлый,
         * и белая подпись на нём даёт около 1,5:1 — исчезает. Там она почти
         * чёрная. Кнопка при этом одна, и про схему знать не должна.
         */
        'on-accent': withAlpha('--text-on-accent'),

        /**
         * Акцент назван по роли, а не по цвету.
         *
         * Имя `gold` описывало конкретный оттенок и соврало бы при первой же
         * смене палитры — а имя, которое врёт, хуже отсутствующего. За время
         * жизни проекта акцент сменился дважды, и ни одно место в разметке
         * из-за этого править не пришлось.
         *
         * `bright` — зелёный из макета. Он ярче `DEFAULT` и на белом даёт
         * 3,3:1, поэтому годится только под заливку плоскостей: полосы,
         * кольца, индикаторы. Текстом его набирать нельзя.
         */
        accent: {
          DEFAULT: withAlpha('--accent'),
          strong: withAlpha('--accent-strong'),
          bright: withAlpha('--accent-bright'),
          muted: withAlpha('--accent-muted'),
          soft: withAlpha('--accent-soft'),
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

      /**
       * Типографическая шкала.
       *
       * До неё в разметке жили 22 произвольных кегля, из которых 11, 11,5, 12
       * и 12,5 занимали 154 места — четыре размера в полутора пунктах, которые
       * глаз не различает, но которые мешают выстроить иерархию: заголовок
       * карточки и подпись под ним получались почти одинаковыми.
       *
       * Здесь восемь ступеней, и между соседними всегда есть заметный шаг.
       * Названия по роли, а не по числу: `text-caption` переживёт смену
       * размера, `text-[12.5px]` — нет.
       *
       * Отрицательный трекинг только на крупных кеглях: без него большие
       * числа выглядят разреженными. На мелком тексте он вредит, особенно
       * кириллице.
       */
      fontSize: {
        /** Прописные подписи разделов и метки. */
        overline: ['11px', { lineHeight: '14px', letterSpacing: '0.08em' }],
        /** Служебное: время в ленте, единицы, сноски. */
        footnote: ['12px', { lineHeight: '16px' }],
        /** Вторичный текст, плотные таблицы. */
        caption: ['13px', { lineHeight: '18px' }],
        /** Основной текст интерфейса. */
        body: ['14px', { lineHeight: '20px' }],
        /** Значения в строках, крупные ячейки. */
        subhead: ['15px', { lineHeight: '20px' }],
        /** Заголовок карточки. */
        heading: ['17px', { lineHeight: '22px', letterSpacing: '-0.01em' }],
        /** Заголовок экрана. */
        title: ['22px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
        /** Показатель на карточке, крупное число. */
        display: ['30px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
      },

      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        /** Номера заказов, суммы, часы — там, где колонки цифр должны совпадать. */
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        /** Фирменные места: экран входа, заголовки разделов. Не для таблиц. */
        display: ['var(--font-display)', 'Georgia', 'serif'],
        /** Название фирмы на экране входа. Классическая антиква, только там. */
        wordmark: ['var(--font-wordmark)', 'Georgia', 'serif'],
      },

      boxShadow: {
        /** На светлом фоне тень мягкая и холодная: рамка несёт больше. */
        panel: '0 1px 2px rgb(17 34 28 / 0.05)',
        /** Приподнятая карточка — та, что в макете лежит поверх шапки. */
        raised: '0 8px 24px -14px rgb(17 34 28 / 0.28), 0 2px 6px -3px rgb(17 34 28 / 0.08)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.3), 0 0 24px -8px rgb(var(--accent) / 0.45)',
      },

      borderRadius: {
        /** Скругление карточек из макета — заметно круглее прежнего. */
        panel: '16px',
        tile: '12px',
      },
    },
  },
  plugins: [],
};

export default config;

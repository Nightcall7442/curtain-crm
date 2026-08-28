import reactHooks from 'eslint-plugin-react-hooks';

import base from './eslint-preset.mjs';

/**
 * Пресет для React-приложений: базовые правила плюс проверка хуков.
 *
 * `rules-of-hooks` и `exhaustive-deps` ловят класс ошибок, который типы
 * не видят в принципе: условный вызов хука и устаревшее замыкание в
 * `useEffect`. В интерфейсе, где данные приходят асинхронно, устаревшее
 * замыкание проявляется как «кнопка отправляет прошлое значение формы» —
 * и воспроизводится через раз.
 *
 * `exhaustive-deps` — предупреждение, а не ошибка: правило иногда требует
 * зависимостей, которые заведомо стабильны, и превращать сборку в красную
 * из-за этого не стоит. Но игнорировать его молча тоже нельзя, поэтому оно
 * видно в выводе.
 */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

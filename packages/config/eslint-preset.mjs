import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Общий ESLint-пресет монорепозитория (flat config).
 *
 * Набор правил отражает требования к качеству кода из ТЗ:
 *  - `any` запрещён явно (`no-explicit-any` плюс семейство `no-unsafe-*`);
 *  - потерянный `await` в tRPC-процедуре ловится `no-floating-promises`:
 *    без него транзакция могла бы завершиться раньше записи в БД;
 *  - `switch-exhaustiveness-check` не даёт молча пропустить новый статус
 *    заказа или новый тип схемы начисления.
 *
 * Взят `recommendedTypeChecked`, а не `strictTypeChecked`: строгий набор
 * содержит стилистические правила (например, запрет шаблонных строк с
 * числами), которые к безопасности типов отношения не имеют и дают сотни
 * замечаний, за которыми теряются настоящие.
 *
 * Использование в пакете (`eslint.config.mjs`):
 *   import preset from '@curtain-crm/config/eslint-preset';
 *   export default preset;
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/migrations/**',
      '**/*.config.{js,mjs,cjs,ts}',
      '**/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      /**
       * Ловит switch по union-типу, где забыли новый вариант.
       *
       * `considerDefaultExhaustiveForUnions` включён: там, где `default`
       * написан осознанно (подбор типа уведомления по статусу заказа),
       * перечислять все семнадцать статусов незачем. Правило продолжает
       * работать для switch БЕЗ default — а это как раз тот случай,
       * когда новый статус молча проваливается мимо всех веток.
       */
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // Тесты: в них допустимы длинные функции и обращения к приватным деталям.
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);

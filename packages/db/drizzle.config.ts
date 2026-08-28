import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Переменные берём из корневого .env монорепозитория, локальный .env пакета
// (если он есть) имеет приоритет — так удобно указывать тестовую базу.
loadEnv({ path: ['.env', '../../.env'] });

const databaseUrl = process.env['DATABASE_URL'];

if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error(
    'DATABASE_URL не задана. Скопируйте .env.example в .env в корне репозитория.',
  );
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  // strict: подтверждение перед разрушающими операциями;
  // verbose: печатать SQL, который будет применён.
  strict: true,
  verbose: true,
});

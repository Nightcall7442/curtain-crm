const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

/**
 * Конфигурация Metro для монорепозитория.
 *
 * Без этого файла приложение НЕ СОБИРАЕТСЯ — проверено `expo export`:
 *
 *  1. Metro по умолчанию ищет пакеты только рядом с проектом, а в pnpm-репозитории
 *     часть зависимостей лежит в корневом `node_modules`. Отсюда `watchFolders`
 *     и явный список `nodeModulesPaths`.
 *
 *  2. Классический резолвер Metro читает поле `main` и не понимает `exports`.
 *     `superjson` тянет `copy-anything`, у которого `main` указывает на файл,
 *     которого в пакете нет — он публикуется только через `exports`. Сборка
 *     падала на этом с «none of these files exist». `unstable_enablePackageExports`
 *     включает разбор `exports`; в Expo SDK 53 он станет поведением по умолчанию.
 *
 * Иерархический поиск (`disableHierarchicalLookup`) НЕ отключаем: pnpm
 * раскладывает зависимости символическими ссылками, и без подъёма по дереву
 * Metro перестанет находить транзитивные пакеты.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.unstable_enablePackageExports = true;

module.exports = config;

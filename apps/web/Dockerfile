# Образ веб-панели.
#
# Собирается из КОРНЯ репозитория:
#   docker build -f apps/web/Dockerfile .
#
# Причины одной стадии — те же, что у API: символические ссылки pnpm не
# переживают копирование `node_modules` между стадиями.
# Стадия сборки приложения мастерской для браузера.
#
# Панель раздаёт его по адресу `/app/`: это тот же код, что стоит у
# сотрудников на телефонах, собранный Expo под веб. Сборка идёт здесь, а не
# коммитом готовой статики, потому что иначе браузерная версия молча
# отставала бы от телефонной на каждую правку — а заметить это можно только
# по жалобе из цеха.
#
# Стадия отдельная и выбрасывается: приложению для телефона нужен весь
# react-native со сборщиком, и тащить их в образ панели незачем — наружу
# уходят только готовые файлы.
FROM node:22-alpine AS pwa

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/mobile/package.json apps/mobile/
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @curtain-crm/mobile...

COPY packages/ packages/
COPY apps/api/ apps/api/
COPY apps/mobile/ apps/mobile/

# Metro складывает граф модулей целиком в память, и стандартной кучи Node
# на приложение такого размера не хватает — сборка падает на OOM.
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV CI=1
ENV EXPO_NO_TELEMETRY=1

RUN pnpm --filter @curtain-crm/mobile exec expo export -p web --output-dir /pwa


# Образ самой панели.
FROM node:22-alpine

RUN apk add --no-cache tini

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# tsconfig.base.json обязателен: от него наследуются tsconfig всех пакетов,
# и `next build` без него падает с TS5083 ещё до старта компиляции.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

# `@curtain-crm/api` нужен панели только ради типа `AppRouter` — он
# импортируется через `import type` и стирается компилятором, поэтому Hono,
# Drizzle и драйвер postgres в браузерный бандл не попадают. Но для проверки
# типов при сборке пакет должен присутствовать.
RUN pnpm install --frozen-lockfile --filter @curtain-crm/web...

COPY packages/ packages/
COPY apps/api/ apps/api/
COPY apps/web/ apps/web/

# Приложение для телефона — статикой рядом с панелью. Адрес `/app/` разводит
# `next.config.ts`; файлы отсюда Next отдаёт как есть.
COPY --from=pwa /pwa apps/web/public/app

# Адрес API снаружи НЕ передаётся: при NODE_ENV=production сборка сама
# подставляет относительный `/trpc` (см. next.config.ts). Браузер обращается
# на тот же домен, откуда пришла страница, прокси разводит запросы, а CORS
# в проде не участвует вовсе.
#
# Передавать путь аргументом сборки оказалось ненадёжно: Git Bash на Windows
# подменяет `/trpc` на `C:/Program Files/Git/trpc` ещё до запуска docker build.
ENV NODE_ENV=production

# `rewrites()` вычисляется на этапе `next build`, поэтому адрес API обязан
# быть виден сборке. Railway отдаёт переменные сервиса Dockerfile-сборке
# ТОЛЬКО через объявленный ARG — без этих двух строк переменная доступна
# рантайму, но не сборке, и панель молча собирается без проксирования
# `/trpc`, `/files` и `/health`.
ARG API_INTERNAL_URL
ENV API_INTERNAL_URL=${API_INTERNAL_URL}

RUN pnpm --filter @curtain-crm/web build

USER node

# Порт НЕ передаётся флагом `next start --port`, а берётся из окружения:
# `next start` читает PORT сам. Платформы вроде Railway или Fly назначают
# порт своей переменной, и контейнер с зашитым флагом там не получит трафик —
# балансировщик стучится на назначенный порт, а процесс слушает другой.
ENV PORT=3001
EXPOSE 3001

# Проверка тоже идёт по PORT, а не по зашитому числу: иначе на платформе,
# подменившей порт, healthcheck вечно красный при живом приложении.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "--filter", "@curtain-crm/web", "start"]

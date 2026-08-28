# Образ API.
#
# Собирается из КОРНЯ репозитория, а не из этой папки:
#   docker build -f apps/api/Dockerfile .
# Иначе в контекст сборки не попадут `packages/shared` и `packages/db`,
# которые подключены как воркспейс-зависимости.
#
# Одна стадия, а не многостадийная сборка. pnpm раскладывает зависимости
# символическими ссылками в `.pnpm`, и копирование `node_modules` между
# стадиями ломает эти ссылки. Образ выходит крупнее, зато собирается тем же
# способом, каким проект работает локально, — а значит, не расходится с ним.
FROM node:22-alpine

# `tini` как PID 1: без него Node не получает SIGTERM от `docker stop`
# и контейнер убивается по таймауту, не закрыв пул подключений к БД.
RUN apk add --no-cache tini

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Манифесты копируются отдельно от исходников: слой с зависимостями
# переиспользуется, пока не изменился `pnpm-lock.yaml`.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

# `@curtain-crm/api...` — сам пакет и его воркспейс-зависимости.
# Мобильное приложение с его Expo-зависимостями в образ API не тянется.
RUN pnpm install --frozen-lockfile --filter @curtain-crm/api...

COPY packages/ packages/
COPY apps/api/ apps/api/

# Каталог хранилища создаём заранее и отдаём пользователю `node`: в compose
# сюда монтируется том, и без прав на запись первая же загрузка фото упадёт.
RUN mkdir -p /app/storage && chown -R node:node /app/storage

# Не от root: процесс, до которого дотягивается загрузка файлов из интернета,
# не должен иметь права хозяйничать в контейнере.
USER node

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV STORAGE_DISK_PATH=/app/storage

EXPOSE 3000

# Проверка живости без БД и без токена — её же использует compose.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]

# API запускается через `tsx`, как и локально: рабочие пакеты монорепозитория
# подключены исходниками (`"main": "./src/index.ts"`), и компиляция API
# в JavaScript потребовала бы сборки ещё и для `shared` с `db`. Это стоит
# сделать отдельной задачей; преимущество будет во времени старта, а не
# в скорости работы — `tsx` компилирует один раз при запуске.
CMD ["pnpm", "--filter", "@curtain-crm/api", "start"]

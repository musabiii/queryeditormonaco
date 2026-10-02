# Образ редактора: standalone-сборка Next.js (server.js + нужные файлы),
# без исходников и полного node_modules.

FROM node:24-alpine AS deps
WORKDIR /app
# postinstall копирует Monaco из node_modules в public/monaco — скрипт нужен до npm ci.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    SHARE_DIR=/app/data/shares
# Статику (public: Monaco, модели конфигураций; .next/static) отдаёт сам server.js.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Каталог ссылок «Поделиться» — сюда монтируется том (владелец node переносится в том).
RUN mkdir -p /app/data/shares && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]

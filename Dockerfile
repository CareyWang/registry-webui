# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS web-builder
WORKDIR /src

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN CI=true pnpm install --frozen-lockfile

COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN pnpm run build

FROM nginx:1.29-alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-builder /src/dist /usr/share/nginx/html

EXPOSE 3000

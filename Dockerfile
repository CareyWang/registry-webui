# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS web-builder
WORKDIR /src/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM golang:1.26-alpine AS go-builder
WORKDIR /src

COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/registry-webui ./cmd/registry-webui

FROM alpine:3.22 AS runtime

RUN apk add --no-cache ca-certificates \
  && addgroup -S registry-webui \
  && adduser -S -D -H -G registry-webui registry-webui

WORKDIR /app

COPY --from=go-builder /out/registry-webui /usr/local/bin/registry-webui
COPY --from=web-builder /src/web/dist ./web/dist

ENV APP_PORT=3000 \
  WEB_DIST_DIR=/app/web/dist

EXPOSE 3000

USER registry-webui
ENTRYPOINT ["/usr/local/bin/registry-webui"]

# Praesidium — Cloud Run image (Next.js standalone output, served by Bun)
#
# Build:  docker build -t praesidium .        (or: gcloud run deploy --source .)
# Run:    docker run -p 8080:8080 -e GEMINI_API_KEYS=... -e TYPESAFE_API_KEY=... praesidium
#
# All secrets are read at REQUEST time from the runtime environment (Cloud Run
# --set-env-vars / --set-secrets). Nothing secret is needed or baked at build
# time: .env* files are excluded by .dockerignore and the client bundle uses
# no NEXT_PUBLIC_* values.

ARG BUN_VERSION=1.3

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun --bun next build

FROM oven/bun:${BUN_VERSION}-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
# standalone = server.js + only the traced node_modules (incl. sharp's linux binary)
COPY --from=build --chown=bun:bun /app/.next/standalone ./
COPY --from=build --chown=bun:bun /app/.next/static ./.next/static
COPY --from=build --chown=bun:bun /app/public ./public
USER bun
EXPOSE 8080
CMD ["bun", "server.js"]

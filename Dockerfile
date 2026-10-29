# HiveVoice as a single container (Next.js standalone output).
# Build:  docker build -t hivevoice .
# Run:    docker run --env-file .env -p 3000:3000 hivevoice
# Self-hosting with database, login and files: selfhost/ (docs/selbsthosting.md). The image also carries the migrations:
#         docker run --env-file .env hivevoice node scripts/migrate.mjs
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public variables are baked in at build time.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_AUTH_PROVIDERS
ARG NEXT_PUBLIC_PASSKEYS
ARG NEXT_PUBLIC_IMAGE_BASE_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# The database schema and the scripts that set it up, for a self-hosted instance (selfhost/setup.sh).
COPY --from=build --chown=app:app /app/supabase/migrations ./supabase/migrations
COPY --from=build --chown=app:app /app/scripts/migrate.mjs /app/scripts/import-regions.mjs /app/scripts/import-region-coords.mjs ./scripts/
# The scripts load postgres.js by name; the standalone output only keeps the copy bundled into the app.
COPY --from=deps --chown=app:app /app/node_modules/postgres ./node_modules/postgres
USER app
EXPOSE 3000
CMD ["node", "server.js"]

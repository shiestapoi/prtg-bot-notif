FROM node:22-bookworm-slim AS build-deps
WORKDIR /app
COPY .npmrc package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps --ignore-scripts

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
# Wait for build-deps to finish by depending on its output to prevent concurrent npm ci
COPY --from=build-deps /app/package.json ./_wait.json
COPY .npmrc package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --legacy-peer-deps --ignore-scripts
RUN npx prisma generate

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=build-deps /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src
COPY frontend ./frontend
COPY public ./public
RUN cd frontend && npm ci
RUN npm run db:generate
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install curl and system dependencies (highly cached)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy production node_modules (highly cached unless packages change)
COPY package.json package-lock.json ./
COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY --from=prod-deps /app/node_modules ./node_modules

# Install Playwright browsers and system dependencies (only runs when dependencies change)
RUN node node_modules/playwright/cli.js install --with-deps chromium \
  && npm cache clean --force

# Copy only the compiled application output (this changes on every push, but at the very end of the Dockerfile)
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
# Copy source for seed-deploy.ts (needs src/prisma/postgres-options.ts)
COPY --from=build /app/src/prisma ./src/prisma

CMD ["npm", "run", "start:prod"]

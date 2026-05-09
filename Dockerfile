FROM node:22-bookworm-slim AS build

WORKDIR /app

ENV NODE_ENV=development
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

COPY .npmrc package.json package-lock.json ./
COPY prisma.config.ts nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma

RUN npm ci --legacy-peer-deps

COPY src ./src
COPY frontend ./frontend
COPY public ./public

RUN cd frontend && npm ci
RUN npm run db:generate
RUN npm run build
RUN npm prune --omit=dev --legacy-peer-deps

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
COPY --from=build /ms-playwright /ms-playwright
# Copy source for seed-deploy.ts (needs src/prisma/postgres-options.ts)
COPY --from=build /app/src/prisma ./src/prisma
COPY tsconfig.json ./

RUN node node_modules/playwright/cli.js install --with-deps chromium \
  && npm cache clean --force

CMD ["npm", "run", "start:prod"]

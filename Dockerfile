FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm ci

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY examples ./examples
USER node
ENTRYPOINT ["node", "dist/mcp/server.js"]

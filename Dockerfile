FROM node:22-alpine AS builder
ENV CI=true
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
# Install WireGuard tools for key detection
RUN apk add --no-cache wireguard-tools
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/drizzle drizzle/
COPY package.json .
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "build"]

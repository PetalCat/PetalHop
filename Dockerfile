FROM node:22-alpine AS builder
ENV CI=true
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN rm -rf node_modules && pnpm install --prod --frozen-lockfile

FROM node:22-alpine
WORKDIR /app
# Install WireGuard tools for key detection
RUN apk add --no-cache wireguard-tools nftables
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/drizzle drizzle/
COPY package.json .
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "build"]

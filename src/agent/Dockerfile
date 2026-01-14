FROM alpine:latest

# Install dependencies (Node.js + WireGuard tools)
RUN apk add --no-cache nodejs npm wireguard-tools curl iproute2 openresolv

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (if any)
RUN npm install

# Copy source
COPY index.js ./

# Entrypoint
CMD ["node", "index.js"]

# Deploying PetalHop to Production

This guide explains how to deploy the PetalHop Controller to a VPS and connect agents.

## 1. Build and Push Container Image

First, build the controller image locally and push it to GitHub Container Registry (GHCR).

```bash
# Login to GHCR (requires a Personal Access Token with write:packages scope)
echo $CR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Build and Push
docker build -t ghcr.io/petalcat/petalhop:latest .
docker push ghcr.io/petalcat/petalhop:latest
```

## 2. Prepare VPS

SSH into your VPS and install Docker & Docker Compose.

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
```

**WireGuard Note**: The controller container handles WireGuard in userspace/kernel mixed mode. Ensure your VPS kernel supports WireGuard (most modern kernels do). You might need to install `wireguard-tools` on the host depending on your OS, but the container includes userspace tools.

## 3. Deploy Controller

On your VPS, create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  petalhop:
    image: ghcr.io/petalcat/petalhop:latest
    container_name: petalhop-server
    restart: unless-stopped
    # Use standard bridge mode with port mapping
    ports:
      - "3000:3000"       # Web UI
      - "51820:51820/udp" # WireGuard VPN
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_MODULE
    volumes:
      - ./data:/app/data             # Persist Database
      - ./wireguard:/etc/wireguard   # Persist Keys
    environment:
      # Public URL of your controller (required for agents to connect)
      - ORIGIN=https://hop.yourdomain.com
      # External Endpoint for WireGuard (VPS Public IP:Port)
      - SERVER_ENDPOINT=YOUR_VPS_IP:51820
      - DATABASE_URL=file:/app/data/prod.db
      - BODY_SIZE_LIMIT=512M
    sysctls:
      - net.ipv4.ip_forward=1
      - net.ipv4.conf.all.src_valid_mark=1
```

Start the service:

```bash
docker compose up -d
```

### 3.2 Post-Deployment Setup (Critical)

Before connecting any agents, you must configure the server's WireGuard settings:
1.  **Log in** to your PetalHop Dashboard (`https://hop.yourdomain.com`).
2.  Go to **Settings**.
3.  Scroll to **Server WireGuard Configuration**.
4.  Enter your **Server Public Key** (you can click "Detect" if WireGuard is running, or generate one).
5.  Enter your **Server Endpoint** (e.g., `YOUR_VPS_IP:51820`).
6.  Click **Save**.

*Note: Without this, agents will fail to connect with a "Configuration parsing error".*

### Alternative: Docker Run (One-Liner)

If you prefer `docker run` over `docker-compose`:

```bash
docker run -d \
  --name petalhop-server \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 51820:51820/udp \
  --cap-add=NET_ADMIN \
  --cap-add=NET_RAW \
  --cap-add=SYS_MODULE \
  --sysctl net.ipv4.ip_forward=1 \
  --sysctl net.ipv4.conf.all.src_valid_mark=1 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/wireguard:/etc/wireguard \
  -e ORIGIN="https://hop.yourdomain.com" \
  -e SERVER_ENDPOINT="YOUR_VPS_IP:51820" \
  -e DATABASE_URL="file:/app/data/prod.db" \
  ghcr.io/petalcat/petalhop:latest
```

### 3.1 Reverse Proxy (Optional via Caddy/Nginx or Cloudflare Tunnel)

To serve the UI on HTTPS (port 443), you should put a reverse proxy in front of port 3000, or use Cloudflare Tunnel.

**Example Caddyfile:**
```
hop.yourdomain.com {
    reverse_proxy localhost:3000
}
```

## 4. Deploying Agents

On the remote machines you want to manage (the "Hosts"):

1.  **Install Docker.**
2.  **Generate an Invite Token** from the PetalHop Dashboard -> Agents -> Add Agent.
3.  **Run the Installer Command** provided by the dashboard.

### Linux Deployment (Required)

PetalHop Agents **must** be deployed on a Linux host to support proper ingress traffic routing. Other operating systems (macOS, Windows) are **not supported** as they lack the necessary network namespace capabilities for host networking.

```bash
docker run -d \
  --name petalhop-agent \
  --restart unless-stopped \
  --network host \
  --cap-add=NET_ADMIN \
  -e TOKEN="YOUR_INVITE_TOKEN" \
  -e CONTROLLER_URL="https://hop.yourdomain.com" \
  ghcr.io/petalcat/petalhop-agent:latest
```

> [!IMPORTANT]
> **Environment Variables**:
> *   `CONTROLLER_URL`: Must point to your **public** controller domain (e.g. `https://hop.yourdomain.com`), **NOT** localhost.
> *   `TOKEN`: The invite token from the dashboard.

#!/bin/sh
set -e

# Ensure wireguard directory exists
mkdir -p /etc/wireguard

# Generate keys if they don't exist
if [ ! -f /etc/wireguard/private.key ]; then
    echo "Generating WireGuard keys..."
    wg genkey | tee /etc/wireguard/private.key | wg pubkey > /etc/wireguard/public.key
    chmod 600 /etc/wireguard/private.key
fi

PRIVATE_KEY=$(cat /etc/wireguard/private.key)
PUBLIC_KEY=$(cat /etc/wireguard/public.key)

echo "Server Public Key: $PUBLIC_KEY"

# Create wg0.conf if it doesn't exist
if [ ! -f /etc/wireguard/wg0.conf ]; then
    echo "Creating default wg0.conf..."
    cat <<EOF > /etc/wireguard/wg0.conf
[Interface]
PrivateKey = $PRIVATE_KEY
Address = 10.8.0.1/24
ListenPort = 51820
EOF
fi

# Try to start WireGuard (requires NET_ADMIN capability)
if ip link show wg0 > /dev/null 2>&1; then
    echo "WireGuard interface wg0 already exists."
else
    echo "Starting WireGuard..."
    # We use try/catch style by checking exit code because in some restricted docker envs this might fail
    if wg-quick up wg0; then
        echo "WireGuard started successfully."
    else
        echo "WARNING: Failed to start WireGuard. Ensure container has NET_ADMIN capability."
    fi
fi

# Start the application
exec "$@"

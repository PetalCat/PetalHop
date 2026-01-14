import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import dockerfile from '../../agent/Dockerfile?raw';
import indexJs from '../../agent/index.js?raw';
import packageJson from '../../agent/package.json?raw';

// GET /setup - Returns the agent installer script
export const GET: RequestHandler = async (event) => {
    // Determine controller URL from request if not specified (though usually passed in args)
    // The script expects --token and --url arguments.
    // If --url is not passed to the bash script, we might want to default it?
    // But the script is `curl | bash -s -- ...` so the args go to the script.

    const script = `#!/bin/bash
set -e

# Default values
CONTROLLER_URL=""
TOKEN=""

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --url) CONTROLLER_URL="$2"; shift ;;
        --token) TOKEN="$2"; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$TOKEN" ]; then
    echo "Error: --token is required."
    exit 1
fi

if [ -z "$CONTROLLER_URL" ]; then
    echo "Error: --url is required."
    exit 1
fi

echo "🌸 PetalHop Agent Installer"
echo "Controller: $CONTROLLER_URL"
echo "Token:      $TOKEN"

# 1. Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker and try again."
    exit 1
fi

echo "Creating local agent build directory..."
BUILD_DIR="$HOME/.petalhop-agent/build"
mkdir -p "$BUILD_DIR"

# 2. Write Agent Source
echo "Writing Dockerfile..."
cat << 'EOF' > "$BUILD_DIR/Dockerfile"
${dockerfile}
EOF

echo "Writing package.json..."
cat << 'EOF' > "$BUILD_DIR/package.json"
${packageJson}
EOF

echo "Writing index.js..."
cat << 'EOF' > "$BUILD_DIR/index.js"
${indexJs}
EOF

# 3. Build Image
echo "Building Agent Image (docker build)..."
cd "$BUILD_DIR"
docker build -t petalhop-agent .

# 4. Run Container
echo "Starting Agent Container..."
# Stop existing if any
docker rm -f petalhop-agent 2>/dev/null || true

# Run with necessary caps for WireGuard
docker run -d \\
    --name petalhop-agent \\
    --restart unless-stopped \\
    --cap-add=NET_ADMIN \\
    --cap-add=NET_RAW \\
    --sysctl="net.ipv4.conf.all.src_valid_mark=1" \\
    -e TOKEN="$TOKEN" \\
    -e CONTROLLER_URL="$CONTROLLER_URL" \\
    petalhop-agent

echo "✅ Agent deployed successfully!"
echo "Check logs with: docker logs -f petalhop-agent"
`;

    return text(script);
};

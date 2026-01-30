#!/bin/bash
# Initial setup script for LUKSO node

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
CONFIGS_DIR="$REPO_DIR/configs"

echo "🔷 LUKSO Docker Node Setup"
echo ""

# Check for .env
if [ ! -f "$REPO_DIR/.env" ]; then
  echo "Creating .env from .env.example..."
  cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
  echo "⚠️  Please edit .env and set GRAFANA_ADMIN_PASSWORD"
  echo ""
fi

# Load config
export $(grep -v '^#' "$REPO_DIR/.env" | xargs)
DATA_DIR="${DATA_DIR:-/mnt/lukso-node}"

echo "Data directory: $DATA_DIR"
echo "Configs directory: $CONFIGS_DIR"
echo ""

# Create data directories
echo "Creating data directories..."
sudo mkdir -p "$DATA_DIR"/{geth,lighthouse}

# Download genesis.ssz if not present
if [ ! -f "$CONFIGS_DIR/genesis.ssz" ]; then
  echo "Downloading genesis.ssz..."
  wget -q -O "$CONFIGS_DIR/genesis.ssz" \
    https://raw.githubusercontent.com/lukso-network/network-configs/main/mainnet/shared/genesis.ssz
  echo "✅ genesis.ssz downloaded"
else
  echo "✅ genesis.ssz already exists"
fi

# Generate JWT if not present
if [ ! -f "$CONFIGS_DIR/jwt.hex" ]; then
  echo "Generating JWT secret..."
  openssl rand -hex 32 > "$CONFIGS_DIR/jwt.hex"
  echo "✅ JWT secret generated"
else
  echo "✅ jwt.hex already exists"
fi

# Make scripts executable
chmod +x "$SCRIPT_DIR"/*.sh

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env and set GRAFANA_ADMIN_PASSWORD"
echo "  2. Start the node: docker compose up -d"
echo "  3. Check status: ./scripts/status.sh"
echo "  4. View logs: docker compose logs -f"
echo "  5. Open Grafana: http://localhost:${GRAFANA_PORT:-3000}"

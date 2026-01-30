#!/bin/bash
# Reset Geth chaindata and resync
# Use this if you get "invalid parent" errors

set -e

# Load DATA_DIR from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

DATA_DIR="${DATA_DIR:-/mnt/lukso-node}"

echo "⚠️  This will delete Geth chaindata and trigger a resync."
echo "    Data directory: $DATA_DIR"
echo ""
read -p "Are you sure? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

echo "Stopping containers..."
docker compose down

echo "Removing chaindata..."
sudo rm -rf "$DATA_DIR/geth/geth/chaindata"
sudo rm -rf "$DATA_DIR/geth/geth/triecache"

echo "Starting containers..."
docker compose up -d

echo ""
echo "✅ Reset complete. Monitor sync progress with:"
echo "   docker compose logs -f geth lighthouse"
echo "   ./scripts/status.sh"

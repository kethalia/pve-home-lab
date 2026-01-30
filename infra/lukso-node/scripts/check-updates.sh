#!/bin/bash
# Update client versions

set -e

echo "Current versions:"
grep "VERSION=" .env | grep -v "^#"
echo ""

echo "Checking for updates..."
echo ""

# Get latest Geth version
LATEST_GETH=$(curl -s https://api.github.com/repos/ethereum/go-ethereum/releases/latest | jq -r '.tag_name')
echo "Latest Geth: $LATEST_GETH"

# Get latest Lighthouse version
LATEST_LH=$(curl -s https://api.github.com/repos/sigp/lighthouse/releases/latest | jq -r '.tag_name')
echo "Latest Lighthouse: $LATEST_LH"

echo ""
echo "To update, edit .env with new versions, then run:"
echo "  docker compose pull"
echo "  docker compose up -d"

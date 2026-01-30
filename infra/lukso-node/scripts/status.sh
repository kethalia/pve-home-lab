#!/bin/bash
# Check sync status of both clients

set -e

echo "=== Geth Sync Status ==="
GETH_SYNC=$(curl -s http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}')

if echo "$GETH_SYNC" | grep -q '"result":false'; then
  BLOCK=$(curl -s http://localhost:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | \
    jq -r '.result' | xargs printf "%d\n")
  echo "✅ Synced at block $BLOCK"
else
  echo "$GETH_SYNC" | jq '.result'
fi

echo ""
echo "=== Lighthouse Sync Status ==="
LH_SYNC=$(curl -s http://localhost:5052/eth/v1/node/syncing)

if echo "$LH_SYNC" | jq -e '.data.is_syncing == false' > /dev/null 2>&1; then
  SLOT=$(echo "$LH_SYNC" | jq -r '.data.head_slot')
  echo "✅ Synced at slot $SLOT"
else
  echo "$LH_SYNC" | jq '.data'
fi

echo ""
echo "=== Peer Counts ==="
GETH_PEERS=$(curl -s http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' | \
  jq -r '.result' | xargs printf "%d\n")
echo "Geth peers: $GETH_PEERS"

LH_PEERS=$(curl -s http://localhost:5052/eth/v1/node/peer_count | jq -r '.data.connected')
echo "Lighthouse peers: $LH_PEERS"

#!/usr/bin/env bash
# =============================================================================
# smoke-test.sh — Quick health check for LXC development container
#
# Usage: bash smoke-test.sh [--user coder]
# Exit code: 0 = all passed, 1 = some checks failed
# =============================================================================
set -uo pipefail

CONTAINER_USER="${1:-coder}"
if [ "$1" = "--user" ] 2>/dev/null; then CONTAINER_USER="${2:-coder}"; fi

PASS=0
FAIL=0

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    printf '  \033[0;32m[PASS]\033[0m  %s\n' "$name"
    (( PASS++ )) || true
  else
    printf '  \033[0;31m[FAIL]\033[0m  %s\n' "$name"
    (( FAIL++ )) || true
  fi
}

check_user() {
  local name="$1"
  local cmd="$2"
  if sudo -u "$CONTAINER_USER" bash -c "
    export NVM_DIR=\${HOME}/.nvm
    [ -s \"\${NVM_DIR}/nvm.sh\" ] && . \"\${NVM_DIR}/nvm.sh\"
    export PATH=\${HOME}/.foundry/bin:\${HOME}/.local/share/pnpm:\${PATH}
    $cmd
  " >/dev/null 2>&1; then
    printf '  \033[0;32m[PASS]\033[0m  %s\n' "$name"
    (( PASS++ )) || true
  else
    printf '  \033[0;31m[FAIL]\033[0m  %s\n' "$name"
    (( FAIL++ )) || true
  fi
}

echo "============================================"
echo "LXC Development Container — Smoke Test"
echo "============================================"
echo ""

echo "--- System ---"
check "Config-manager service enabled"  "systemctl is-enabled config-manager"
check "Last sync completed"             "[ -f /var/lib/config-manager/last-sync ]"
check "No active conflicts"             "[ ! -f /var/lib/config-manager/CONFLICT ]"
check "User ${CONTAINER_USER} exists"   "id ${CONTAINER_USER}"

echo ""
echo "--- System Tools ---"
check "git"        "command -v git"
check "curl"       "command -v curl"
check "vim"        "command -v vim"
check "htop"       "command -v htop"
check "jq"         "command -v jq"

echo ""
echo "--- Development Tools ---"
check "Docker daemon"      "docker info"
check "Docker Compose"     "docker compose version"
check "Zsh"                "command -v zsh"
check "GitHub CLI"         "command -v gh"
check_user "Node.js"       "command -v node"
check_user "Foundry"       "command -v forge"
check_user "PNPM"          "command -v pnpm"

echo ""
echo "--- Docker Functional ---"
check "Docker run"         "docker run --rm hello-world"

echo ""
echo "--- Configuration ---"
check "Config file exists" "[ -f /etc/config-manager/config.env ]"
check "Sync log exists"    "[ -f /var/log/config-manager/sync.log ]"
check "Repo cloned"        "[ -d /opt/config-manager/repo/.git ]"

echo ""
echo "============================================"
TOTAL=$(( PASS + FAIL ))
if [ "$FAIL" -eq 0 ]; then
  printf '\033[0;32mAll %d checks passed.\033[0m\n' "$TOTAL"
  exit 0
else
  printf '\033[0;31m%d/%d checks failed.\033[0m\n' "$FAIL" "$TOTAL"
  exit 1
fi

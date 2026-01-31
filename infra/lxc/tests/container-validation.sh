#!/usr/bin/env bash
# =============================================================================
# container-validation.sh — Full validation suite for LXC containers
#
# Validates all aspects of the configuration management system:
#   - Service status and configuration
#   - Tool installation and versions
#   - File deployment and policies
#   - Package installation completeness
#   - User environment configuration
#
# Usage: bash container-validation.sh [--user coder] [--verbose]
# =============================================================================
set -uo pipefail

CONTAINER_USER="coder"
VERBOSE=false
PASS=0
FAIL=0
WARN=0

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --user)    CONTAINER_USER="$2"; shift 2 ;;
    --verbose) VERBOSE=true; shift ;;
    *)         shift ;;
  esac
done

USER_HOME="/home/${CONTAINER_USER}"

# Helpers
pass() { printf '  \033[0;32m[PASS]\033[0m  %s\n' "$*"; (( PASS++ )) || true; }
fail() { printf '  \033[0;31m[FAIL]\033[0m  %s\n' "$*"; (( FAIL++ )) || true; }
warn() { printf '  \033[0;33m[WARN]\033[0m  %s\n' "$*"; (( WARN++ )) || true; }
info() { $VERBOSE && printf '  \033[0;36m[INFO]\033[0m  %s\n' "$*" || true; }

assert_cmd() {
  if command -v "$1" >/dev/null 2>&1; then pass "$1 installed"; else fail "$1 not found"; fi
}

assert_user_cmd() {
  if sudo -u "$CONTAINER_USER" bash -c "
    export NVM_DIR=\${HOME}/.nvm
    [ -s \"\${NVM_DIR}/nvm.sh\" ] && . \"\${NVM_DIR}/nvm.sh\"
    export PATH=\${HOME}/.foundry/bin:\${HOME}/.local/share/pnpm:\${PATH}
    command -v $1
  " >/dev/null 2>&1; then
    pass "$1 installed (user)"
  else
    fail "$1 not found (user)"
  fi
}

assert_file() {
  if [ -f "$1" ]; then pass "File exists: $1"; else fail "File missing: $1"; fi
}

assert_dir() {
  if [ -d "$1" ]; then pass "Dir exists: $1"; else fail "Dir missing: $1"; fi
}

echo "============================================"
echo "LXC Container Full Validation"
echo "User: ${CONTAINER_USER}"
echo "Date: $(date)"
echo "============================================"

# --- Section 1: Config Manager Service ---
echo ""
echo "=== Config Manager Service ==="
if systemctl is-enabled config-manager >/dev/null 2>&1; then
  pass "Service enabled"
else
  fail "Service not enabled"
fi

assert_file "/etc/config-manager/config.env"
assert_file "/usr/local/bin/config-sync.sh"
assert_file "/usr/local/bin/config-rollback"
assert_dir  "/var/log/config-manager"
assert_dir  "/var/lib/config-manager"

if [ -f /var/lib/config-manager/last-sync ]; then
  pass "Last sync: $(cat /var/lib/config-manager/last-sync)"
else
  warn "No sync has been performed yet"
fi

if [ -f /var/lib/config-manager/CONFLICT ]; then
  fail "Active conflict detected!"
else
  pass "No conflicts"
fi

# --- Section 2: User Environment ---
echo ""
echo "=== User Environment ==="
if id "$CONTAINER_USER" >/dev/null 2>&1; then
  pass "User ${CONTAINER_USER} exists"
else
  fail "User ${CONTAINER_USER} does not exist"
fi

if sudo -n true 2>/dev/null; then
  pass "Sudo access"
else
  warn "Sudo may not be configured"
fi

assert_dir "${USER_HOME}/projects"
assert_dir "${USER_HOME}/bin"
assert_dir "${USER_HOME}/.config"
assert_dir "${USER_HOME}/.ssh"

# --- Section 3: System Tools ---
echo ""
echo "=== System Tools ==="
for tool in git curl wget vim nano htop jq rsync sudo unzip; do
  assert_cmd "$tool"
done

# --- Section 4: Development Tools ---
echo ""
echo "=== Development Tools ==="
assert_cmd "docker"
assert_cmd "zsh"
assert_cmd "gh"
assert_user_cmd "node"
assert_user_cmd "forge"
assert_user_cmd "pnpm"

# Docker functional test
if docker info >/dev/null 2>&1; then
  pass "Docker daemon running"
else
  fail "Docker daemon not running"
fi

# --- Section 5: File Deployment ---
echo ""
echo "=== File Deployment ==="
CONFIGS_DIR="/opt/config-manager/repo/infra/lxc/container-configs"
if [ -d "${CONFIGS_DIR}/files" ]; then
  for file in "${CONFIGS_DIR}/files"/*; do
    [ -f "$file" ] || continue
    basename="$(basename "$file")"
    case "$basename" in
      *.path|*.policy) continue ;;
    esac

    path_file="${file}.path"
    [ -f "$path_file" ] || continue

    target_dir="$(head -1 "$path_file" | tr -d '[:space:]')"
    target_path="${target_dir}/${basename}"

    if [ -f "$target_path" ]; then
      pass "Deployed: ${basename} → ${target_path}"
    else
      policy_file="${file}.policy"
      policy="default"
      [ -f "$policy_file" ] && policy="$(head -1 "$policy_file" | tr -d '[:space:]')"
      if [ "$policy" = "default" ]; then
        info "Default policy — file may have been customized: ${target_path}"
      else
        fail "Not deployed: ${basename} → ${target_path}"
      fi
    fi
  done
else
  warn "No files directory found in configs"
fi

# --- Section 6: Shell Configuration ---
echo ""
echo "=== Shell Configuration ==="
user_shell="$(getent passwd "${CONTAINER_USER}" | cut -d: -f7)"
if [[ "$user_shell" == */zsh ]]; then
  pass "Default shell: zsh"
else
  warn "Default shell: ${user_shell} (expected zsh)"
fi

assert_dir "${USER_HOME}/.oh-my-zsh"
if [ -d "${USER_HOME}/.oh-my-zsh/custom/themes/powerlevel10k" ]; then
  pass "Powerlevel10k theme"
else
  warn "Powerlevel10k not installed"
fi

# --- Summary ---
echo ""
echo "============================================"
TOTAL=$(( PASS + FAIL + WARN ))
echo "Results: ${PASS} passed, ${FAIL} failed, ${WARN} warnings (${TOTAL} total)"

if [ "$FAIL" -eq 0 ]; then
  printf '\033[0;32mValidation PASSED\033[0m\n'
  exit 0
else
  printf '\033[0;31mValidation FAILED (%d issues)\033[0m\n' "$FAIL"
  exit 1
fi

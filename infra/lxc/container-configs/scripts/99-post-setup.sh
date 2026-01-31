#!/usr/bin/env bash
# =============================================================================
# 99-post-setup.sh — Final validation and welcome message
# =============================================================================
set -euo pipefail

USER_HOME="/home/${CONTAINER_USER}"

log_info "Running post-setup validation..."

# Verify key tools
tools_ok=0
tools_total=0

check_tool() {
  local name="$1"
  local cmd="$2"
  (( tools_total++ )) || true
  if is_installed "$cmd"; then
    log_info "  [OK] ${name}"
    (( tools_ok++ )) || true
  else
    # Also check as the container user (for NVM-managed tools)
    if sudo -u "${CONTAINER_USER}" bash -c "
      export NVM_DIR=\${HOME}/.nvm
      [ -s \"\${NVM_DIR}/nvm.sh\" ] && . \"\${NVM_DIR}/nvm.sh\"
      export PATH=\${HOME}/.foundry/bin:\${HOME}/.local/share/pnpm:\${PATH}
      command -v ${cmd}
    " >/dev/null 2>&1; then
      log_info "  [OK] ${name} (user-installed)"
      (( tools_ok++ )) || true
    else
      log_warn "  [--] ${name}: not found"
    fi
  fi
}

check_tool "Docker"     "docker"
check_tool "Git"        "git"
check_tool "Node.js"    "node"
check_tool "Zsh"        "zsh"
check_tool "GitHub CLI" "gh"
check_tool "Foundry"    "forge"
check_tool "PNPM"       "pnpm"

log_info "Post-setup: ${tools_ok}/${tools_total} tools verified."

# Fix permissions on user home
chown -R "${CONTAINER_USER}:${CONTAINER_USER}" "${USER_HOME}" 2>/dev/null || true

log_info "Post-setup complete."

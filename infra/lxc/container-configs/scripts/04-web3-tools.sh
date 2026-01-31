#!/usr/bin/env bash
# =============================================================================
# 04-web3-tools.sh — Foundry and Web3 development tools (idempotent)
# =============================================================================
set -euo pipefail

USER_HOME="/home/${CONTAINER_USER}"

# ---------------------------------------------------------------------------
# Foundry (forge, cast, anvil, chisel)
# ---------------------------------------------------------------------------
if sudo -u "${CONTAINER_USER}" bash -c 'command -v forge' >/dev/null 2>&1; then
  log_info "Foundry already installed: $(sudo -u "${CONTAINER_USER}" bash -c 'forge --version 2>/dev/null | head -1' || echo 'unknown')"
else
  log_info "Installing Foundry..."
  sudo -u "${CONTAINER_USER}" bash -c '
    curl -L https://foundry.paradigm.xyz 2>/dev/null | bash >/dev/null 2>&1
    export PATH="${HOME}/.foundry/bin:${PATH}"
    foundryup >/dev/null 2>&1
  ' || {
    log_warn "Foundry installation failed — skipping."
  }

  if sudo -u "${CONTAINER_USER}" bash -c 'export PATH="${HOME}/.foundry/bin:${PATH}" && command -v forge' >/dev/null 2>&1; then
    log_info "Foundry installed successfully."
  fi
fi

log_info "Web3 tools setup complete."

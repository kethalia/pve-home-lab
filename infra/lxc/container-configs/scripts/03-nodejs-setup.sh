#!/usr/bin/env bash
# =============================================================================
# 03-nodejs-setup.sh — Node.js installation via NVM (idempotent)
# =============================================================================
set -euo pipefail

USER_HOME="/home/${CONTAINER_USER}"
NVM_DIR="${USER_HOME}/.nvm"
DEFAULT_NODE="24"
NODE_VERSIONS=("18" "20" "22" "24")

# Check if NVM is already installed
if [ -d "$NVM_DIR" ] && [ -s "${NVM_DIR}/nvm.sh" ]; then
  log_info "NVM already installed."
else
  log_info "Installing NVM..."
  sudo -u "${CONTAINER_USER}" bash -c \
    'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash' \
    >/dev/null 2>&1
  log_info "NVM installed."
fi

# Source NVM for the rest of this script
export NVM_DIR
# shellcheck disable=SC1091
[ -s "${NVM_DIR}/nvm.sh" ] && . "${NVM_DIR}/nvm.sh"

# Install Node.js versions
for version in "${NODE_VERSIONS[@]}"; do
  if sudo -u "${CONTAINER_USER}" bash -c "source ${NVM_DIR}/nvm.sh && nvm ls ${version} 2>/dev/null | grep -q 'v${version}'" 2>/dev/null; then
    log_info "  Node.js ${version}: already installed."
  else
    log_info "  Installing Node.js ${version}..."
    sudo -u "${CONTAINER_USER}" bash -c "source ${NVM_DIR}/nvm.sh && nvm install ${version}" >/dev/null 2>&1 || {
      log_warn "  Failed to install Node.js ${version}"
    }
  fi
done

# Set default version
log_info "Setting default Node.js version to ${DEFAULT_NODE}..."
sudo -u "${CONTAINER_USER}" bash -c "source ${NVM_DIR}/nvm.sh && nvm alias default ${DEFAULT_NODE}" >/dev/null 2>&1 || true

log_info "Node.js setup complete."

#!/usr/bin/env bash
# =============================================================================
# web3-dev-install.sh — Runs inside the LXC container during creation
#
# Called by ProxmoxVE build.func as the install script for the container.
# Sets up base system and installs the config-manager service.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Output helpers (compatible with ProxmoxVE patterns)
# ---------------------------------------------------------------------------
msg_info()  { printf '  \033[0;36m[INFO]\033[0m  %s\n' "$*"; }
msg_ok()    { printf '  \033[0;32m[ OK ]\033[0m  %s\n' "$*"; }
msg_error() { printf '  \033[0;31m[FAIL]\033[0m  %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REPO_URL="https://github.com/kethalia/pve-home-lab.git"
REPO_BRANCH="main"
CONTAINER_USER="coder"
CONTAINER_USER_HOME="/home/${CONTAINER_USER}"

# ---------------------------------------------------------------------------
# Phase 1: Base system setup
# ---------------------------------------------------------------------------
msg_info "Updating base system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
msg_ok "Base system updated"

msg_info "Installing essential packages"
apt-get install -y -qq \
  ca-certificates \
  curl \
  git \
  gnupg \
  lsb-release \
  sudo \
  wget \
  >/dev/null 2>&1
msg_ok "Essential packages installed"

# ---------------------------------------------------------------------------
# Phase 2: Create container user
# ---------------------------------------------------------------------------
msg_info "Creating user: ${CONTAINER_USER}"
if ! id "$CONTAINER_USER" >/dev/null 2>&1; then
  useradd "$CONTAINER_USER" \
    --create-home \
    --shell=/bin/bash \
    --uid=1000 \
    --user-group
  echo "${CONTAINER_USER} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/nopasswd
  chmod 0440 /etc/sudoers.d/nopasswd
fi

# Create standard directories
mkdir -p "${CONTAINER_USER_HOME}"/{projects,bin,.config,.ssh}
chown -R "${CONTAINER_USER}:${CONTAINER_USER}" "${CONTAINER_USER_HOME}"
msg_ok "User ${CONTAINER_USER} created"

# ---------------------------------------------------------------------------
# Phase 3: Install config-manager
# ---------------------------------------------------------------------------
msg_info "Installing config-manager service"

# Clone the repository
REPO_DIR="/opt/config-manager/repo"
mkdir -p /opt/config-manager
if [ ! -d "${REPO_DIR}/.git" ]; then
  git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$REPO_DIR"
fi

# Run the config-manager installer
INSTALLER="${REPO_DIR}/infra/lxc/scripts/config-manager/install-config-manager.sh"
if [ -f "$INSTALLER" ]; then
  bash "$INSTALLER" "$REPO_URL" \
    --branch "$REPO_BRANCH" \
    --user "$CONTAINER_USER" \
    --repo-dir "$REPO_DIR"
  msg_ok "config-manager installed"
else
  msg_error "config-manager installer not found at: $INSTALLER"
  exit 1
fi

# ---------------------------------------------------------------------------
# Phase 4: Run initial configuration sync
# ---------------------------------------------------------------------------
msg_info "Running initial configuration sync"
if [ -f /usr/local/bin/config-sync.sh ]; then
  /usr/local/bin/config-sync.sh || {
    msg_error "Initial sync failed — check /var/log/config-manager/sync.log"
    # Don't fail the container creation; tools will be installed on next boot
    true
  }
  msg_ok "Initial configuration sync complete"
else
  msg_error "config-sync.sh not found"
fi

# ---------------------------------------------------------------------------
# Phase 5: Final setup
# ---------------------------------------------------------------------------
msg_info "Final system configuration"

# Set locale
if command -v locale-gen >/dev/null 2>&1; then
  locale-gen en_US.UTF-8 >/dev/null 2>&1 || true
fi

# Ensure config-manager runs on next boot
systemctl enable config-manager.service 2>/dev/null || true

msg_ok "Container setup complete"
msg_info "The config-manager service will keep this container in sync with the git repository."

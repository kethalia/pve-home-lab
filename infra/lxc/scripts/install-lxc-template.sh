#!/usr/bin/env bash
# shellcheck disable=SC1090,SC2034,SC2154
# SC1090: Dynamic sourcing required for ProxmoxVE framework
# SC2034: ProxmoxVE framework variables used externally
# SC2154: ProxmoxVE framework provides these variables

# Generic LXC container installation script
# All template-specific configuration should be in container-configs/

# Copyright (c) 2026 kethalia  
# Author: kethalia
# License: MIT | https://github.com/kethalia/pve-home-lab/raw/main/LICENSE
# Source: https://github.com/kethalia/pve-home-lab

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

# Configuration (must be provided via environment variables by container.sh)
REPO_URL="${REPO_URL:-https://github.com/kethalia/pve-home-lab.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

# For testing branches, config-manager should use main branch for stability
# Feature branches may not have all the container-configs ready
CONFIG_MANAGER_BRANCH="${CONFIG_MANAGER_BRANCH:-main}"

# CONFIG_PATH must be set by the calling container.sh script
if [[ -z "${CONFIG_PATH}" ]]; then
  msg_error "CONFIG_PATH environment variable is required but not set"
  exit 1
fi

msg_info "Installing config-manager service"

# Create necessary directories (including /opt/config-manager for systemd namespace)
mkdir -p /etc/config-manager
mkdir -p /var/log/config-manager
mkdir -p /var/lib/config-manager/{backups,state}
mkdir -p /opt/config-manager
mkdir -p /usr/local/lib/config-manager/package-handlers
mkdir -p /run/config-manager

# Write configuration file
msg_info "Creating configuration file"
cat > /etc/config-manager/config.env <<EOF
# config-manager configuration
# Generated on $(date '+%Y-%m-%d %H:%M:%S')

# Git repository containing container configurations
CONFIG_REPO_URL="${REPO_URL}"

# Branch to track (use main for config-manager stability during testing)
CONFIG_BRANCH="${CONFIG_MANAGER_BRANCH}"

# Sub-path inside the repository where container configs live
CONFIG_PATH="${CONFIG_PATH}"

# Path to helper scripts inside the repository (relative to repo root)
CONFIG_HELPER_PATH="${CONFIG_HELPER_PATH:-infra/lxc/scripts/config-manager}"

# --- Snapshot configuration ---
# Enable snapshots: auto (enable if backend available), yes, or no
SNAPSHOT_ENABLED=auto

# Number of days to retain old snapshots before cleanup
SNAPSHOT_RETENTION_DAYS=7

# Snapshot backend: auto (detect best), zfs, lvm, btrfs, or none (file backups)
SNAPSHOT_BACKEND=auto
EOF

chmod 600 /etc/config-manager/config.env
msg_ok "Configuration file created"

# Download config-sync.sh
msg_info "Downloading config-sync script"
if ! curl -fsSL --max-time 60 -A "ProxmoxVE-Script/1.0" \
    "https://raw.githubusercontent.com/kethalia/pve-home-lab/${REPO_BRANCH}/infra/lxc/scripts/config-manager/config-sync.sh" \
    -o /usr/local/bin/config-sync.sh; then
  msg_error "Failed to download config-sync.sh"
  exit 1
fi

# Verify download
if [[ ! -s /usr/local/bin/config-sync.sh ]]; then
  msg_error "Downloaded config-sync.sh is empty"
  exit 1
fi

if ! head -1 /usr/local/bin/config-sync.sh | grep -q '^#!/'; then
  msg_error "Downloaded config-sync.sh is invalid (missing shebang)"
  exit 1
fi

chmod 755 /usr/local/bin/config-sync.sh
msg_ok "Config-sync script installed"

# Download systemd service file
msg_info "Downloading systemd service file"
if ! curl -fsSL --max-time 60 -A "ProxmoxVE-Script/1.0" \
    "https://raw.githubusercontent.com/kethalia/pve-home-lab/${REPO_BRANCH}/infra/lxc/scripts/config-manager/config-manager.service" \
    -o /etc/systemd/system/config-manager.service; then
  msg_error "Failed to download config-manager.service"
  exit 1
fi

# Verify download
if [[ ! -s /etc/systemd/system/config-manager.service ]]; then
  msg_error "Downloaded config-manager.service is empty"
  exit 1
fi

if ! grep -q '^\[Unit\]' /etc/systemd/system/config-manager.service; then
  msg_error "Downloaded config-manager.service is invalid (not a systemd unit file)"
  exit 1
fi

chmod 644 /etc/systemd/system/config-manager.service
msg_ok "Systemd service file installed"

# Enable and start the service
msg_info "Enabling and starting config-manager service"
systemctl daemon-reload || {
  msg_error "Failed to reload systemd daemon"
  exit 1
}

systemctl enable config-manager.service || {
  msg_error "Failed to enable config-manager service"
  exit 1
}

# Ensure git is installed before starting config-manager
msg_info "Ensuring git is installed"
if ! command -v git &>/dev/null; then
  apt-get update -qq && apt-get install -y -qq git
fi

if ! command -v git &>/dev/null; then
  msg_error "Failed to install git - config-manager requires git"
  exit 1
fi
msg_ok "Git is installed"

# Start the service to perform initial sync
msg_info "Running initial configuration sync"
if ! systemctl start config-manager.service; then
  msg_error "Initial sync failed. Check logs: journalctl -u config-manager"
  msg_error "Container may not be fully configured"
  exit 1
fi

msg_ok "Config-manager installed and configured successfully"

# ProxmoxVE standard finalizations
msg_info "Configuring SSH access"
motd_ssh
msg_ok "SSH access configured"

msg_info "Applying ProxmoxVE customizations"
customize
msg_ok "Customizations applied"

msg_info "Cleaning up container"
cleanup_lxc
msg_ok "Container cleanup completed"

# Display completion message
msg_ok "Container setup complete!"
echo -e "${CREATING}${GN}===========================================${CL}"
echo -e "${CREATING}${GN}  LXC Container Ready!${CL}"
echo -e "${CREATING}${GN}===========================================${CL}"
echo -e ""
echo -e "${INFO}${YW}Configuration applied from:${CL}"
echo -e "${TAB}Repository: ${BGN}${REPO_URL}${CL}"
echo -e "${TAB}Branch: ${BGN}${REPO_BRANCH}${CL}"
echo -e "${TAB}Path: ${BGN}${CONFIG_PATH}${CL}"
echo -e ""
echo -e "${INFO}${YW}Container IP:${CL} ${BGN}${IP}${CL}"
echo -e ""
echo -e "${INFO}${YW}Config Management:${CL}"
echo -e "${TAB}• Manual sync: ${BGN}sudo systemctl restart config-manager${CL}"
echo -e "${TAB}• View logs: ${BGN}journalctl -u config-manager -f${CL}"
echo -e "${TAB}• Rollback: ${BGN}config-rollback list${CL}"
echo -e ""
echo -e "${WARN}${RD}Note:${CL} Check container-specific documentation for access details"

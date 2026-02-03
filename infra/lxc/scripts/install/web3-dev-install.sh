#!/usr/bin/env bash

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

msg_info "Installing base system packages"
$STD apt-get install -y \
  curl \
  git \
  sudo \
  wget \
  ca-certificates \
  gnupg \
  build-essential \
  vim \
  unzip \
  software-properties-common
msg_ok "Installed base system packages"

msg_info "Creating coder user (UID 1000)"
useradd -m -u 1000 -s /bin/bash -G sudo coder
echo "coder ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/coder
chmod 0440 /etc/sudoers.d/coder
msg_ok "Created coder user"

msg_info "Installing Starship prompt"
$STD curl -sS https://starship.rs/install.sh | sh -s -- --yes
# Configure for coder user
sudo -u coder bash -c 'echo "eval \"\$(starship init bash)\"" >> ~/.bashrc'
# Configure for root user as well
echo 'eval "$(starship init bash)"' >> /root/.bashrc
msg_ok "Installed Starship prompt"

msg_info "Installing config-manager service"
# Determine the path to the install script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SCRIPT="/tmp/install-config-manager.sh"

# Copy from local repository if available, otherwise download
if [[ -f "${SCRIPT_DIR}/../config-manager/install-config-manager.sh" ]]; then
  msg_info "Using local config-manager installer"
  cp "${SCRIPT_DIR}/../config-manager/install-config-manager.sh" "$INSTALL_SCRIPT"
else
  msg_info "Downloading config-manager installer"
  $STD curl -fsSL https://raw.githubusercontent.com/kethalia/pve-home-lab/main/infra/lxc/scripts/config-manager/install-config-manager.sh \
    -o "$INSTALL_SCRIPT"
fi

chmod +x "$INSTALL_SCRIPT"

# Install and run config-manager with the pve-home-lab repository
$STD bash "$INSTALL_SCRIPT" \
  --repo-url "https://github.com/kethalia/pve-home-lab.git" \
  --branch "main" \
  --config-path "infra/lxc/container-configs" \
  --run

rm -f "$INSTALL_SCRIPT"
msg_ok "Installed config-manager service"

msg_info "Ensuring coder user permissions"
# Add coder to docker group (if docker gets installed by config-manager)
# This is idempotent - the group may not exist yet
usermod -aG docker coder 2>/dev/null || true
msg_ok "Updated coder user permissions"

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

# Display final summary
msg_ok "Web3 Dev Container setup complete!\n"
echo -e "${CREATING}${GN}===========================================${CL}"
echo -e "${CREATING}${GN}  Web3 Development Container Ready!${CL}"
echo -e "${CREATING}${GN}===========================================${CL}"
echo -e ""
echo -e "${INFO}${YW}Container Details:${CL}"
echo -e "${TAB}• User: ${BGN}coder${CL} (UID 1000)"
echo -e "${TAB}• Shell: ${BGN}bash${CL} with Starship prompt"
echo -e "${TAB}• Config sync: ${BGN}Enabled${CL} at boot"
echo -e "${TAB}• IP Address: ${BGN}${IP}${CL}"
echo -e ""
echo -e "${INFO}${YW}Access Methods:${CL}"
echo -e "${TAB}• SSH: ${BGN}ssh coder@${IP}${CL}"
echo -e "${TAB}• Console: Via ProxmoxVE web interface"
echo -e ""
echo -e "${INFO}${YW}Configuration Management:${CL}"
echo -e "${TAB}• Check sync logs: ${BGN}journalctl -u config-manager${CL}"
echo -e "${TAB}• Manual sync: ${BGN}sudo systemctl restart config-manager${CL}"
echo -e "${TAB}• Config status: ${BGN}config-rollback status${CL}"
echo -e "${TAB}• List snapshots: ${BGN}config-rollback list${CL}"
echo -e ""
echo -e "${INFO}${YW}Development Tools:${CL}"
echo -e "${TAB}Tools will be installed via git-synced configuration:"
echo -e "${TAB}• Docker (with Docker Compose)"
echo -e "${TAB}• Node.js ecosystem (Node.js, npm, pnpm)"
echo -e "${TAB}• Web3 tools (Foundry, Solidity)"
echo -e "${TAB}• CLI utilities (gh, act)"
echo -e ""
echo -e "${WARN}${RD}Note:${CL} Some tools may require container restart to be available in PATH"
echo -e "${INFO}${YW}Repository:${CL} ${BGN}https://github.com/kethalia/pve-home-lab${CL}"
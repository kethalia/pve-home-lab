#!/usr/bin/env bash
# shellcheck disable=SC1090,SC2034,SC2154
# SC1090: Dynamic sourcing required for ProxmoxVE framework
# SC2034: ProxmoxVE framework variables used externally
# SC2154: ProxmoxVE framework provides these variables

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

# Configuration (can be overridden via environment variables)
REPO_URL="${REPO_URL:-https://github.com/kethalia/pve-home-lab.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
CONFIG_PATH="${CONFIG_PATH:-infra/lxc/container-configs}"

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
if ! useradd -m -u 1000 -s /bin/bash -G sudo coder; then
  msg_error "Failed to create coder user"
  exit 1
fi

# Configure sudo access via group membership (more secure than NOPASSWD:ALL)
# The user is already in the sudo group, which requires password by default
# For development containers, we enable NOPASSWD for common operations
cat > /etc/sudoers.d/coder <<'EOF'
# Allow coder user passwordless sudo for development operations
coder ALL=(ALL) NOPASSWD: /usr/bin/systemctl, /usr/bin/docker, /usr/bin/git, /usr/local/bin/config-sync.sh, /usr/local/bin/config-rollback
# Allow full sudo with password for other operations
coder ALL=(ALL:ALL) ALL
EOF

if ! chmod 0440 /etc/sudoers.d/coder; then
  msg_error "Failed to set permissions on sudoers file"
  exit 1
fi

# Validate sudoers file syntax
if ! visudo -c -f /etc/sudoers.d/coder; then
  msg_error "Invalid sudoers configuration"
  rm -f /etc/sudoers.d/coder
  exit 1
fi

msg_ok "Created coder user"

msg_info "Installing Starship prompt"

# Install Starship using prebuilt binary (more secure than curl|sh)
STARSHIP_VERSION="latest"
STARSHIP_ARCH="x86_64-unknown-linux-gnu"
STARSHIP_TEMP="$(mktemp -t starship.XXXXXX.tar.gz)"

if ! curl -fsSL --max-time 30 -A "ProxmoxVE-Script/1.0" \
    "https://github.com/starship/starship/releases/latest/download/starship-${STARSHIP_ARCH}.tar.gz" \
    -o "${STARSHIP_TEMP}"; then
  msg_error "Failed to download Starship binary"
  rm -f "${STARSHIP_TEMP}"
  exit 1
fi

# Extract to /usr/local/bin
if ! tar -xzf "${STARSHIP_TEMP}" -C /usr/local/bin/; then
  msg_error "Failed to extract Starship binary"
  rm -f "${STARSHIP_TEMP}"
  exit 1
fi

rm -f "${STARSHIP_TEMP}"

# Verify installation
if ! command -v starship >/dev/null 2>&1; then
  msg_error "Starship binary not found after installation"
  exit 1
fi

# Ensure coder home directory exists and is properly owned
if [ ! -d "/home/coder" ]; then
  mkdir -p /home/coder
  chown coder:coder /home/coder
fi

# Configure for coder user
if ! sudo -u coder bash -c 'echo "eval \"\$(starship init bash)\"" >> /home/coder/.bashrc'; then
  msg_warn "Failed to configure Starship for coder user"
fi

# Configure for root user as well
if ! echo 'eval "$(starship init bash)"' >> /root/.bashrc; then
  msg_warn "Failed to configure Starship for root user"
fi

msg_ok "Installed Starship prompt"

msg_info "Installing config-manager service"
INSTALL_SCRIPT="$(mktemp -t install-config-manager.XXXXXX.sh)"

# Download the config-manager installer from repository
if ! curl -fsSL --max-time 60 -A "ProxmoxVE-Script/1.0" \
    "https://raw.githubusercontent.com/kethalia/pve-home-lab/main/infra/lxc/scripts/config-manager/install-config-manager.sh" \
    -o "${INSTALL_SCRIPT}"; then
  msg_error "Failed to download config-manager installer"
  rm -f "${INSTALL_SCRIPT}"
  exit 1
fi

# Verify that the installer script was successfully obtained
if [[ ! -f "${INSTALL_SCRIPT}" ]] || [[ ! -s "${INSTALL_SCRIPT}" ]]; then
  msg_error "Config-manager installer is empty or missing"
  rm -f "${INSTALL_SCRIPT}"
  exit 1
fi

if ! chmod +x "${INSTALL_SCRIPT}"; then
  msg_error "Failed to make installer executable"
  rm -f "${INSTALL_SCRIPT}"
  exit 1
fi

# Install and run config-manager with the pve-home-lab repository
if ! bash "${INSTALL_SCRIPT}" \
  --repo-url "${REPO_URL}" \
  --branch "${REPO_BRANCH}" \
  --config-path "${CONFIG_PATH}" \
  --run; then
  msg_error "Config-manager installation failed"
  rm -f "${INSTALL_SCRIPT}"
  exit 1
fi

rm -f "${INSTALL_SCRIPT}"
msg_ok "Installed config-manager service"

msg_info "Ensuring coder user permissions"
# Add coder to docker group (if docker gets installed by config-manager)
# This is idempotent - the group may not exist yet
if getent group docker >/dev/null 2>&1; then
  if usermod -aG docker coder; then
    msg_info "Added coder to docker group"
  else
    msg_warn "Failed to add coder to docker group"
  fi
else
  msg_info "Docker group not found yet - will be added post-installation by config-manager"
fi
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
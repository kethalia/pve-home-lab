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

# CONFIG_PATH must be set by the calling container.sh script
if [[ -z "${CONFIG_PATH}" ]]; then
  msg_error "CONFIG_PATH environment variable is required but not set"
  exit 1
fi

msg_info "Installing config-manager service"

# Create temp directory for repo clone
TEMP_REPO_DIR="$(mktemp -d -t pve-home-lab-XXXXXX)"
trap 'rm -rf "${TEMP_REPO_DIR}"' EXIT

# Clone the repository
msg_info "Cloning configuration repository"
if ! git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${TEMP_REPO_DIR}" &>/dev/null; then
  msg_error "Failed to clone repository: ${REPO_URL}"
  exit 1
fi

# Navigate to config-manager directory and run installer
INSTALLER_PATH="${TEMP_REPO_DIR}/infra/lxc/scripts/config-manager/install-config-manager.sh"

if [[ ! -f "${INSTALLER_PATH}" ]]; then
  msg_error "Config-manager installer not found at: ${INSTALLER_PATH}"
  exit 1
fi

if ! chmod +x "${INSTALLER_PATH}"; then
  msg_error "Failed to make installer executable"
  exit 1
fi

# Install and run config-manager
# All template-specific setup will be handled by container-configs/
msg_info "Running config-manager with template configuration"
if ! bash "${INSTALLER_PATH}" \
  --repo-url "${REPO_URL}" \
  --branch "${REPO_BRANCH}" \
  --config-path "${CONFIG_PATH}" \
  --run; then
  msg_error "Config-manager installation failed"
  exit 1
fi

msg_ok "Config-manager installed and initial sync completed"

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

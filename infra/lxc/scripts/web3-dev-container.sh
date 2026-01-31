#!/usr/bin/env bash
# =============================================================================
# web3-dev-container.sh — ProxmoxVE LXC install script for Web3 Development
#
# Creates an LXC container with a full Web3/full-stack development environment
# using the ProxmoxVE community scripts pattern (build.func).
#
# Usage (from Proxmox shell):
#   bash -c "$(wget -qLO - https://raw.githubusercontent.com/kethalia/pve-home-lab/main/infra/lxc/scripts/web3-dev-container.sh)"
#
# Source: https://github.com/kethalia/pve-home-lab
# License: MIT
# =============================================================================
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)

APP="Web3-Dev"
var_tags="${var_tags:-web3;development;nodejs;docker}"
var_cpu="${var_cpu:-4}"
var_ram="${var_ram:-8192}"
var_disk="${var_disk:-20}"
var_os="${var_os:-ubuntu}"
var_version="${var_version:-24.04}"
var_unprivileged="${var_unprivileged:-0}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  msg_info "Running configuration sync (config-manager)"
  if [ -f /usr/local/bin/config-sync.sh ]; then
    $STD /usr/local/bin/config-sync.sh
    msg_ok "Configuration sync complete"
  else
    msg_error "config-manager not installed. Run the install script first."
    exit 1
  fi

  msg_info "Updating base system"
  $STD apt-get update
  $STD apt-get upgrade -y
  msg_ok "Base system updated"

  msg_ok "Updated successfully!"
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access your development container via SSH or Proxmox console.${CL}"
echo -e "${TAB}${GATEWAY}${BGN}ssh root@${IP}${CL}"
echo -e "${INFO}${YW} The config-manager service will configure tools on first boot.${CL}"

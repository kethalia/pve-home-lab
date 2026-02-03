#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2026 kethalia
# Author: kethalia
# License: MIT | https://github.com/kethalia/pve-home-lab/raw/main/LICENSE
# Source: https://github.com/kethalia/pve-home-lab

APP="Web3 Dev Container"
var_tags="${var_tags:-web3;development;nodejs;docker}"
var_cpu="${var_cpu:-4}"
var_ram="${var_ram:-8192}"
var_disk="${var_disk:-20}"
var_os="${var_os:-ubuntu}"
var_version="${var_version:-24.04}"
var_unprivileged="${var_unprivileged:-0}"  # Privileged for Docker-in-Docker

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  msg_info "Updating base system"
  $STD apt update
  $STD apt upgrade -y
  msg_ok "Base system updated"

  msg_info "Re-running configuration sync"
  if systemctl is-active --quiet config-manager; then
    $STD systemctl restart config-manager
    msg_ok "Configuration sync completed"
  else
    msg_warn "Config-manager service is not active. Starting service..."
    $STD systemctl start config-manager
    msg_ok "Configuration sync started"
  fi

  msg_ok "Updated successfully!"
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access your container via SSH:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}ssh coder@${IP}${CL}"
echo -e "${INFO}${YW} Configuration Management:${CL}"
echo -e "${TAB}Check sync logs: ${BGN}journalctl -u config-manager${CL}"
echo -e "${TAB}Manual sync: ${BGN}sudo systemctl restart config-manager${CL}"
echo -e "${TAB}Config status: ${BGN}config-rollback status${CL}"
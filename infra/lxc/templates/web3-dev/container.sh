#!/usr/bin/env bash
# shellcheck disable=SC1090,SC2034,SC2154
# SC1090: Dynamic sourcing required for ProxmoxVE framework
# SC2034: ProxmoxVE framework variables used externally
# SC2154: ProxmoxVE framework provides these variables

source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/2026-02-02/misc/build.func)
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
var_install="${var_install:-https://raw.githubusercontent.com/kethalia/pve-home-lab/main/infra/lxc/templates/web3-dev/install.sh}"
var_nesting="${var_nesting:-1}"
var_keyctl="${var_keyctl:-1}"
var_fuse="${var_fuse:-1}"

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

default_description="Completed successfully!

${APP} setup has been successfully initialized!

Access your container via SSH:
  ssh coder@\${IP}

Configuration Management:
  Check sync logs: journalctl -u config-manager
  Manual sync: sudo systemctl restart config-manager
  Config status: config-rollback status"

start
build_container
description
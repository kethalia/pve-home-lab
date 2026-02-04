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

# Detect which branch this script is running from
# This allows testing on feature branches
SCRIPT_BRANCH="fix/web3-dev-unprivileged-and-install"  # Will be changed to 'main' when merged

# Source template configuration
# Works both when run locally and via curl from ProxmoxVE
if [[ -f "$(dirname "${BASH_SOURCE[0]}")/template.conf" ]]; then
  # Local execution
  source "$(dirname "${BASH_SOURCE[0]}")/template.conf"
else
  # Remote execution via curl
  source <(curl -fsSL https://raw.githubusercontent.com/kethalia/pve-home-lab/${SCRIPT_BRANCH}/infra/lxc/templates/web3-dev/template.conf)
fi

# Template metadata
APP="${TEMPLATE_APP}"
var_tags="${var_tags:-${TEMPLATE_TAGS}}"

# Container resources (user can override via var_* environment variables)
var_cpu="${var_cpu:-${TEMPLATE_CPU}}"
var_ram="${var_ram:-${TEMPLATE_RAM}}"
var_disk="${var_disk:-${TEMPLATE_DISK}}"
var_os="${var_os:-${TEMPLATE_OS}}"
var_version="${var_version:-${TEMPLATE_VERSION}}"

# Container features
var_unprivileged="${var_unprivileged:-${TEMPLATE_UNPRIVILEGED}}"
var_nesting="${var_nesting:-${TEMPLATE_NESTING}}"
var_keyctl="${var_keyctl:-${TEMPLATE_KEYCTL}}"
var_fuse="${var_fuse:-${TEMPLATE_FUSE}}"

# Export CONFIG_PATH for installer
export CONFIG_PATH="${TEMPLATE_CONFIG_PATH}"

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

# Build container (framework will attempt to run web3devcontainer-install.sh which doesn't exist - harmless 404 error)
# Note: The 404 error is silently handled by curl's -f flag, so no need to filter stderr
build_container

# Run our actual installer post-build
msg_info "Running Web3 Dev Container configuration"

# Configuration (must be provided via environment variables)
REPO_URL="${REPO_URL:-https://github.com/kethalia/pve-home-lab.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

# The install script needs FUNCTIONS_FILE_PATH (ProxmoxVE framework functions)
# This was already exported by build_container, so it's available in the current shell
# We need to pass it along with other required variables to the container

# Download the install script
INSTALL_SCRIPT=$(curl -fsSL https://raw.githubusercontent.com/kethalia/pve-home-lab/${REPO_BRANCH}/infra/lxc/scripts/install-lxc-template.sh)

# Execute the install script inside the container with required environment
# We need to pass the script content via stdin to avoid quoting issues
if ! lxc-attach -n "$CTID" -- bash -c "
export FUNCTIONS_FILE_PATH='${FUNCTIONS_FILE_PATH}'
export CONFIG_PATH='${CONFIG_PATH}'
export REPO_URL='${REPO_URL}'
export REPO_BRANCH='${REPO_BRANCH}'
bash -s
" <<< "$INSTALL_SCRIPT"; then
  msg_error "Web3 Dev Container configuration failed"
  msg_error "Check logs: journalctl -u config-manager (inside container)"
  exit 1
fi

msg_ok "Web3 Dev Container configured successfully"

description
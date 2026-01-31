#!/usr/bin/env bash
# =============================================================================
# install-config-manager.sh — Install the LXC Configuration Manager service
#
# Usage:
#   bash install-config-manager.sh <REPO_URL> [OPTIONS]
#
# Options:
#   --branch <branch>       Git branch to track (default: main)
#   --user <username>       Container user (default: coder)
#   --configs-dir <path>    Subdir within repo for configs (default: infra/lxc/container-configs)
#   --repo-dir <path>       Where to clone repo (default: /opt/config-manager/repo)
#   --run-now               Run initial sync immediately after install
#
# Example:
#   bash install-config-manager.sh https://github.com/kethalia/pve-home-lab.git --run-now
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
REPO_URL=""
REPO_BRANCH="main"
CONTAINER_USER="coder"
CONFIGS_SUBDIR="infra/lxc/container-configs"
REPO_DIR="/opt/config-manager/repo"
RUN_NOW="false"
SNAPSHOT_ENABLED="auto"
SNAPSHOT_RETENTION_DAYS="7"

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
msg_info()  { printf '  \033[0;36m[INFO]\033[0m  %s\n' "$*"; }
msg_ok()    { printf '  \033[0;32m[ OK ]\033[0m  %s\n' "$*"; }
msg_error() { printf '  \033[0;31m[FAIL]\033[0m  %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
parse_args() {
  if [ $# -lt 1 ]; then
    msg_error "Usage: $0 <REPO_URL> [OPTIONS]"
    msg_error "Run '$0 --help' for more information."
    exit 1
  fi

  if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    cat <<'USAGE'
Usage: install-config-manager.sh <REPO_URL> [OPTIONS]

Arguments:
  REPO_URL                  Git repository URL (required)

Options:
  --branch <branch>         Git branch (default: main)
  --user <username>         Container user (default: coder)
  --configs-dir <path>      Configs subdir in repo (default: infra/lxc/container-configs)
  --repo-dir <path>         Local clone path (default: /opt/config-manager/repo)
  --run-now                 Run first sync after install
  -h, --help                Show this help
USAGE
    exit 0
  fi

  REPO_URL="$1"; shift

  while [ $# -gt 0 ]; do
    case "$1" in
      --branch)       REPO_BRANCH="$2";      shift 2 ;;
      --user)         CONTAINER_USER="$2";    shift 2 ;;
      --configs-dir)  CONFIGS_SUBDIR="$2";    shift 2 ;;
      --repo-dir)     REPO_DIR="$2";          shift 2 ;;
      --run-now)      RUN_NOW="true";         shift   ;;
      *)
        msg_error "Unknown option: $1"
        exit 1
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
install_service() {
  msg_info "Installing config-manager v1.0.0"

  # Detect script source directory
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # Create directories
  mkdir -p /etc/config-manager
  mkdir -p /var/log/config-manager
  mkdir -p /var/lib/config-manager/{checksums,backups}
  mkdir -p /opt/config-manager
  mkdir -p /usr/local/lib/config-manager/package-handlers

  # Write configuration
  msg_info "Writing configuration to /etc/config-manager/config.env"
  cat > /etc/config-manager/config.env <<EOF
# Configuration Manager — generated $(date '+%Y-%m-%d %H:%M:%S')
REPO_URL=${REPO_URL}
REPO_BRANCH=${REPO_BRANCH}
REPO_DIR=${REPO_DIR}
CONFIGS_SUBDIR=${CONFIGS_SUBDIR}
CONTAINER_USER=${CONTAINER_USER}

# Snapshot settings
SNAPSHOT_ENABLED=${SNAPSHOT_ENABLED}
SNAPSHOT_RETENTION_DAYS=${SNAPSHOT_RETENTION_DAYS}
SNAPSHOT_BACKEND=auto
EOF
  msg_ok "Configuration written"

  # Install scripts
  msg_info "Installing scripts to /usr/local/bin and /usr/local/lib/config-manager"

  install -m 0755 "${script_dir}/config-sync.sh"      /usr/local/bin/config-sync.sh
  install -m 0755 "${script_dir}/snapshot-manager.sh"  /usr/local/lib/config-manager/snapshot-manager.sh
  install -m 0755 "${script_dir}/file-manager.sh"      /usr/local/lib/config-manager/file-manager.sh
  install -m 0755 "${script_dir}/script-engine.sh"     /usr/local/lib/config-manager/script-engine.sh
  install -m 0755 "${script_dir}/config-rollback.sh"   /usr/local/bin/config-rollback

  # Install package handlers
  for handler in "${script_dir}"/package-handlers/*.sh; do
    [ -f "$handler" ] || continue
    install -m 0755 "$handler" "/usr/local/lib/config-manager/package-handlers/$(basename "$handler")"
  done
  msg_ok "Scripts installed"

  # Patch config-sync.sh to source from installed location
  sed -i 's|CM_SCRIPT_DIR=.*|CM_SCRIPT_DIR="/usr/local/lib/config-manager"|' /usr/local/bin/config-sync.sh

  # Install systemd service
  msg_info "Installing systemd service"
  install -m 0644 "${script_dir}/config-manager.service" /etc/systemd/system/config-manager.service
  systemctl daemon-reload
  systemctl enable config-manager.service
  msg_ok "Systemd service enabled"

  # Install git if not present
  if ! command -v git >/dev/null 2>&1; then
    msg_info "Installing git..."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq git
    elif command -v apk >/dev/null 2>&1; then
      apk add --quiet git
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y -q git
    fi
    msg_ok "Git installed"
  fi

  msg_ok "config-manager installed successfully"

  # Optionally run first sync
  if [ "$RUN_NOW" = "true" ]; then
    msg_info "Running initial configuration sync..."
    /usr/local/bin/config-sync.sh
    msg_ok "Initial sync complete"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
parse_args "$@"
install_service

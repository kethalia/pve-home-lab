#!/usr/bin/env bash
# install-config-manager.sh — One-command installer for the LXC config manager.
#
# Usage:
#   curl -sSL <raw-url>/install-config-manager.sh | bash
#   — or —
#   bash install-config-manager.sh [--repo-url <url>] [--branch <branch>]
#
# This script:
#   1. Installs required dependencies (git)
#   2. Creates directory structure & default configuration
#   3. Copies the sync script and systemd service into place
#   4. Enables and optionally runs the service
#
# Must be run as root (or via sudo).

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
readonly DEFAULT_REPO_URL="https://github.com/kethalia/pve-home-lab.git"
readonly DEFAULT_BRANCH="main"
readonly DEFAULT_CONFIG_PATH="infra/lxc/container-configs"

REPO_URL="${DEFAULT_REPO_URL}"
BRANCH="${DEFAULT_BRANCH}"
CONFIG_PATH="${DEFAULT_CONFIG_PATH}"
RUN_NOW=false

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { printf '\033[1;34m[INFO]\033[0m  %s\n' "$*"; }
warn()  { printf '\033[1;33m[WARN]\033[0m  %s\n' "$*"; }
error() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }
die()   { error "$@"; exit 1; }

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --repo-url <url>     Git repository URL (default: $DEFAULT_REPO_URL)
  --branch <branch>    Git branch to track   (default: $DEFAULT_BRANCH)
  --config-path <path> Sub-path for configs   (default: $DEFAULT_CONFIG_PATH)
  --run                Run the service immediately after install
  -h, --help           Show this help message
EOF
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --repo-url)   REPO_URL="$2";     shift 2 ;;
            --branch)     BRANCH="$2";       shift 2 ;;
            --config-path) CONFIG_PATH="$2"; shift 2 ;;
            --run)        RUN_NOW=true;      shift   ;;
            -h|--help)    usage; exit 0              ;;
            *)            die "Unknown option: $1"   ;;
        esac
    done
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
preflight() {
    if [[ $EUID -ne 0 ]]; then
        die "This script must be run as root."
    fi

    # Detect package manager
    if command -v apt-get &>/dev/null; then
        PKG_MGR="apt-get"
    elif command -v dnf &>/dev/null; then
        PKG_MGR="dnf"
    elif command -v apk &>/dev/null; then
        PKG_MGR="apk"
    else
        die "Unsupported package manager. This script requires apt-get, dnf, or apk."
    fi

    info "Detected package manager: $PKG_MGR"
}

# ---------------------------------------------------------------------------
# Install dependencies
# ---------------------------------------------------------------------------
install_deps() {
    if command -v git &>/dev/null; then
        info "git is already installed."
        return 0
    fi

    info "Installing git..."
    case "$PKG_MGR" in
        apt-get) apt-get update -qq && apt-get install -y -qq git ;;
        dnf)     dnf install -y -q git                            ;;
        apk)     apk add --quiet git                              ;;
    esac

    command -v git &>/dev/null || die "Failed to install git."
    info "git installed successfully."
}

# ---------------------------------------------------------------------------
# Create directory structure
# ---------------------------------------------------------------------------
create_dirs() {
    info "Creating directory structure..."

    mkdir -p /etc/config-manager
    mkdir -p /var/log/config-manager
    mkdir -p /opt/config-manager
    mkdir -p /var/lib/config-manager/backups
    mkdir -p /var/lib/config-manager/state

    info "Directories created."
}

# ---------------------------------------------------------------------------
# Write default configuration
# ---------------------------------------------------------------------------
write_config() {
    local config_file="/etc/config-manager/config.env"

    if [[ -f "$config_file" ]]; then
        warn "Configuration file already exists: $config_file"
        warn "Preserving existing configuration. Remove it manually to regenerate."
        return 0
    fi

    info "Writing default configuration to $config_file ..."

    cat > "$config_file" <<EOF
# config-manager configuration
# Generated on $(date '+%Y-%m-%d %H:%M:%S')

# Git repository containing container configurations
CONFIG_REPO_URL="${REPO_URL}"

# Branch to track
CONFIG_BRANCH="${BRANCH}"

# Sub-path inside the repository where container configs live
CONFIG_PATH="${CONFIG_PATH}"

# --- Snapshot configuration ---
# Enable snapshots: auto (enable if backend available), yes, or no
SNAPSHOT_ENABLED=auto

# Number of days to retain old snapshots before cleanup
SNAPSHOT_RETENTION_DAYS=7

# Snapshot backend: auto (detect best), zfs, lvm, btrfs, or none (file backups)
SNAPSHOT_BACKEND=auto
EOF

    chmod 600 "$config_file"
    info "Configuration written."
}

# ---------------------------------------------------------------------------
# Install scripts and service
# ---------------------------------------------------------------------------
install_files() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # Validate source files exist
    for file in config-sync.sh config-manager.service; do
        [[ -f "${script_dir}/${file}" ]] || die "Missing required file: ${script_dir}/${file}"
    done

    # Copy sync script
    info "Installing config-sync.sh -> /usr/local/bin/config-sync.sh ..."
    cp "${script_dir}/config-sync.sh" /usr/local/bin/config-sync.sh
    chmod 755 /usr/local/bin/config-sync.sh

    # Copy phase scripts and shared libraries to lib directory
    local lib_dir="/usr/local/lib/config-manager"
    mkdir -p "$lib_dir"
    info "Installing phase scripts and libraries to ${lib_dir}/ ..."

    local -a lib_files=(
        "config-manager-helpers.sh"
        "execute-scripts.sh"
        "process-files.sh"
        "snapshot-manager.sh"
    )

    for lib_file in "${lib_files[@]}"; do
        if [[ -f "${script_dir}/${lib_file}" ]]; then
            cp "${script_dir}/${lib_file}" "${lib_dir}/${lib_file}"
            chmod 755 "${lib_dir}/${lib_file}"
            info "  -> ${lib_dir}/${lib_file}"
        else
            warn "Optional library not found: ${script_dir}/${lib_file} — skipping."
        fi
    done

    # Copy systemd service
    info "Installing systemd service ..."
    cp "${script_dir}/config-manager.service" /etc/systemd/system/config-manager.service
    chmod 644 /etc/systemd/system/config-manager.service

    systemctl daemon-reload || die "Failed to reload systemd daemon."
    info "Files installed."
}

# ---------------------------------------------------------------------------
# Enable (and optionally start) the service
# ---------------------------------------------------------------------------
enable_service() {
    info "Enabling config-manager service ..."
    systemctl enable config-manager.service || die "Failed to enable config-manager service."

    if [[ "$RUN_NOW" == true ]]; then
        info "Running config-manager service now ..."
        if systemctl start config-manager.service; then
            info "Service completed. Check logs: journalctl -u config-manager"
        else
            warn "Service run finished with errors. Check logs: journalctl -u config-manager"
        fi
    fi
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print_summary() {
    cat <<EOF

$(printf '\033[1;32m')========================================
  config-manager installed successfully
========================================$(printf '\033[0m')

  Config:   /etc/config-manager/config.env
  Script:   /usr/local/bin/config-sync.sh
  Service:  config-manager.service
  Logs:     /var/log/config-manager/sync.log

  Repository: ${REPO_URL}
  Branch:     ${BRANCH}
  Config path: ${CONFIG_PATH}

  Next steps:
    1. Review/edit /etc/config-manager/config.env
    2. Run manually:  systemctl start config-manager
    3. Check logs:    journalctl -u config-manager
    4. View sync log: cat /var/log/config-manager/sync.log
    5. Snapshot status: /usr/local/lib/config-manager/snapshot-manager.sh status

EOF
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    parse_args "$@"
    preflight
    install_deps
    create_dirs
    write_config
    install_files
    enable_service
    print_summary
}

main "$@"

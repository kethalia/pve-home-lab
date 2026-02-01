#!/usr/bin/env bash
# handler-apt.sh — APT package handler for Debian/Ubuntu systems.
#
# Functions exported:
#   apt_update_index           — update package index (apt-get update)
#   apt_is_pkg_installed <pkg> — check if a package is installed
#   apt_install_packages <pkg...> — batch install packages
#
# This file is safe to source multiple times (idempotent guard).

# Guard against double-sourcing
[[ -n "${_HANDLER_APT_LOADED:-}" ]] && return 0
readonly _HANDLER_APT_LOADED=1

# ---------------------------------------------------------------------------
# Logging — provide stubs when not sourced from handler-common.sh
# ---------------------------------------------------------------------------
if ! declare -f log_info &>/dev/null; then
    _log() {
        local level="$1"; shift
        printf '[%s] [%-7s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$level" "$*"
    }
    log_info()  { _log INFO    "$@"; }
    log_warn()  { _log WARNING "$@"; }
    log_error() { _log ERROR   "$@"; }
fi

# ---------------------------------------------------------------------------
# apt_update_index — update the apt package index
# ---------------------------------------------------------------------------
apt_update_index() {
    if ! command -v apt-get &>/dev/null; then
        log_error "apt_update_index: apt-get not found."
        return 1
    fi

    apt-get update -qq 2>&1 | while IFS= read -r line; do
        log_info "  [apt-get update] $line"
    done

    return "${PIPESTATUS[0]}"
}

# ---------------------------------------------------------------------------
# apt_is_pkg_installed <pkg> — check if a package is installed
#
# Returns 0 if installed, 1 otherwise.
# ---------------------------------------------------------------------------
apt_is_pkg_installed() {
    local pkg="$1"

    if [[ -z "$pkg" ]]; then
        log_error "apt_is_pkg_installed: package name is required."
        return 1
    fi

    # Use dpkg-query to check installation status
    # The package might have a version specifier (e.g. nodejs=24.*), extract base name
    local pkg_base="${pkg%%=*}"

    if dpkg-query -W -f='${Status}' "$pkg_base" 2>/dev/null | grep -q "install ok installed"; then
        return 0
    else
        return 1
    fi
}

# ---------------------------------------------------------------------------
# apt_install_packages <pkg...> — batch install packages
#
# Installs one or more packages via apt-get install -y.
# ---------------------------------------------------------------------------
apt_install_packages() {
    if [[ $# -eq 0 ]]; then
        log_error "apt_install_packages: at least one package name is required."
        return 1
    fi

    if ! command -v apt-get &>/dev/null; then
        log_error "apt_install_packages: apt-get not found."
        return 1
    fi

    # Install with minimal output, but capture errors
    # Use DEBIAN_FRONTEND=noninteractive to avoid prompts
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" 2>&1 | while IFS= read -r line; do
        # Only log non-empty lines
        [[ -n "$line" ]] && log_info "  [apt-get] $line"
    done

    return "${PIPESTATUS[0]}"
}

# ---------------------------------------------------------------------------
# Direct execution support (for testing)
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    set -euo pipefail

    case "${1:-}" in
        update)
            apt_update_index
            ;;
        check)
            shift
            apt_is_pkg_installed "$@"
            ;;
        install)
            shift
            apt_install_packages "$@"
            ;;
        *)
            echo "Usage: $(basename "$0") {update|check <pkg>|install <pkg...>}"
            exit 1
            ;;
    esac
fi

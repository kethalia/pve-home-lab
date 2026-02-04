#!/usr/bin/env bash
# handler-dnf.sh — DNF/YUM package handler for Fedora/RHEL/CentOS systems.
#
# This handler works with both dnf and yum (uses dnf if available, falls back
# to yum). Both package managers use rpm for installed package checks.
#
# Functions exported:
#   dnf_update_index           — refresh package cache (dnf makecache)
#   dnf_is_pkg_installed <pkg> — check if a package is installed
#   dnf_install_packages <pkg...> — batch install packages
#
# This file is safe to source multiple times (idempotent guard).

# Guard against double-sourcing
[[ -n "${_HANDLER_DNF_LOADED:-}" ]] && return 0
readonly _HANDLER_DNF_LOADED=1

# ---------------------------------------------------------------------------
# Logging — source shared logging utilities
# ---------------------------------------------------------------------------
readonly _HANDLER_DIR="${_HANDLER_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)}"
# shellcheck source=/dev/null
[[ -f "${_HANDLER_DIR}/handler-logging.sh" ]] && source "${_HANDLER_DIR}/handler-logging.sh"
source_logging_stubs

# ---------------------------------------------------------------------------
# Detect which tool to use (dnf or yum)
# ---------------------------------------------------------------------------
_get_pkg_tool() {
    if command -v dnf &>/dev/null; then
        echo "dnf"
    elif command -v yum &>/dev/null; then
        echo "yum"
    else
        return 1
    fi
}

# ---------------------------------------------------------------------------
# dnf_update_index — refresh the package cache
# ---------------------------------------------------------------------------
dnf_update_index() {
    local tool
    tool="$(_get_pkg_tool)" || {
        log_error "dnf_update_index: neither dnf nor yum found."
        return 1
    }

    if [[ "$tool" == "dnf" ]]; then
        dnf makecache -q 2>&1 | while IFS= read -r line; do
            log_info "  [dnf makecache] $line"
        done
    else
        yum makecache -q 2>&1 | while IFS= read -r line; do
            log_info "  [yum makecache] $line"
        done
    fi

    return "${PIPESTATUS[0]}"
}

# ---------------------------------------------------------------------------
# dnf_is_pkg_installed <pkg> — check if a package is installed
#
# Uses rpm -q to check installation status (works for both dnf and yum).
# Returns 0 if installed, 1 otherwise.
# ---------------------------------------------------------------------------
dnf_is_pkg_installed() {
    local pkg="$1"

    if [[ -z "$pkg" ]]; then
        log_error "dnf_is_pkg_installed: package name is required."
        return 1
    fi

    if ! command -v rpm &>/dev/null; then
        log_error "dnf_is_pkg_installed: rpm not found."
        return 1
    fi

    # rpm -q returns 0 if the package is installed
    if rpm -q "$pkg" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# ---------------------------------------------------------------------------
# dnf_install_packages <pkg...> — batch install packages
#
# Installs one or more packages via dnf/yum install -y.
# ---------------------------------------------------------------------------
dnf_install_packages() {
    if [[ $# -eq 0 ]]; then
        log_error "dnf_install_packages: at least one package name is required."
        return 1
    fi

    local tool
    tool="$(_get_pkg_tool)" || {
        log_error "dnf_install_packages: neither dnf nor yum found."
        return 1
    }

    # Install with quiet output
    if [[ "$tool" == "dnf" ]]; then
        dnf install -y -q "$@" 2>&1 | while IFS= read -r line; do
            [[ -n "$line" ]] && log_info "  [dnf] $line"
        done
    else
        yum install -y -q "$@" 2>&1 | while IFS= read -r line; do
            [[ -n "$line" ]] && log_info "  [yum] $line"
        done
    fi

    return "${PIPESTATUS[0]}"
}

# ---------------------------------------------------------------------------
# Direct execution support (for testing)
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
    set -euo pipefail

    case "${1:-}" in
        update)
            dnf_update_index
            ;;
        check)
            shift
            dnf_is_pkg_installed "$@"
            ;;
        install)
            shift
            dnf_install_packages "$@"
            ;;
        *)
            echo "Usage: $(basename "$0") {update|check <pkg>|install <pkg...>}"
            exit 1
            ;;
    esac
fi

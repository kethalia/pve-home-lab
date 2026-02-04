#!/usr/bin/env bash
# handler-apk.sh — APK package handler for Alpine Linux systems.
#
# Functions exported:
#   apk_update_index           — update package index (apk update)
#   apk_is_pkg_installed <pkg> — check if a package is installed
#   apk_install_packages <pkg...> — batch install packages
#
# This file is safe to source multiple times (idempotent guard).

# Guard against double-sourcing
[[ -n "${_HANDLER_APK_LOADED:-}" ]] && return 0
readonly _HANDLER_APK_LOADED=1

# ---------------------------------------------------------------------------
# Logging — source shared logging utilities
# ---------------------------------------------------------------------------
readonly _HANDLER_DIR="${_HANDLER_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)}"
# shellcheck source=/dev/null
[[ -f "${_HANDLER_DIR}/handler-logging.sh" ]] && source "${_HANDLER_DIR}/handler-logging.sh"
source_logging_stubs

# ---------------------------------------------------------------------------
# apk_update_index — update the apk package index
# ---------------------------------------------------------------------------
apk_update_index() {
    if ! command -v apk &>/dev/null; then
        log_error "apk_update_index: apk not found."
        return 1
    fi

    apk update --quiet 2>&1 | while IFS= read -r line; do
        log_info "  [apk update] $line"
    done

    return "${PIPESTATUS[0]}"
}

# ---------------------------------------------------------------------------
# apk_is_pkg_installed <pkg> — check if a package is installed
#
# Returns 0 if installed, 1 otherwise.
# ---------------------------------------------------------------------------
apk_is_pkg_installed() {
    local pkg="$1"

    if [[ -z "$pkg" ]]; then
        log_error "apk_is_pkg_installed: package name is required."
        return 1
    fi

    # apk info -e returns 0 if the package is installed
    if apk info -e "$pkg" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# ---------------------------------------------------------------------------
# apk_install_packages <pkg...> — batch install packages
#
# Installs one or more packages via apk add.
# ---------------------------------------------------------------------------
apk_install_packages() {
    if [[ $# -eq 0 ]]; then
        log_error "apk_install_packages: at least one package name is required."
        return 1
    fi

    if ! command -v apk &>/dev/null; then
        log_error "apk_install_packages: apk not found."
        return 1
    fi

    # Install with quiet output
    apk add --quiet "$@" 2>&1 | while IFS= read -r line; do
        [[ -n "$line" ]] && log_info "  [apk] $line"
    done

    return "${PIPESTATUS[0]}"
}

# ---------------------------------------------------------------------------
# Direct execution support (for testing)
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
    set -euo pipefail

    case "${1:-}" in
        update)
            apk_update_index
            ;;
        check)
            shift
            apk_is_pkg_installed "$@"
            ;;
        install)
            shift
            apk_install_packages "$@"
            ;;
        *)
            echo "Usage: $(basename "$0") {update|check <pkg>|install <pkg...>}"
            exit 1
            ;;
    esac
fi

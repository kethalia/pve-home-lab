#!/usr/bin/env bash
# handler-pip.sh — PIP package handler (cross-distribution).
#
# This handler installs Python packages via pip and works on any distribution
# where Python and pip are installed. Prefers pip3 over pip.
#
# Functions exported:
#   pip_is_available           — check if pip is available
#   pip_is_pkg_installed <pkg> — check if a package is installed
#   pip_install_packages <pkg...> — batch install packages
#
# This file is safe to source multiple times (idempotent guard).

# Guard against double-sourcing
[[ -n "${_HANDLER_PIP_LOADED:-}" ]] && return 0
readonly _HANDLER_PIP_LOADED=1

# ---------------------------------------------------------------------------
# Logging — source shared logging utilities
# ---------------------------------------------------------------------------
readonly _HANDLER_DIR="${_HANDLER_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)}"
# shellcheck source=/dev/null
[[ -f "${_HANDLER_DIR}/handler-logging.sh" ]] && source "${_HANDLER_DIR}/handler-logging.sh"
source_logging_stubs

# ---------------------------------------------------------------------------
# _get_pip_cmd — determine which pip command to use (pip3 or pip)
# ---------------------------------------------------------------------------
_get_pip_cmd() {
    if command -v pip3 &>/dev/null; then
        echo "pip3"
    elif command -v pip &>/dev/null; then
        echo "pip"
    else
        return 1
    fi
}

# ---------------------------------------------------------------------------
# pip_is_available — check if pip is available on the system
# ---------------------------------------------------------------------------
pip_is_available() {
    _get_pip_cmd &>/dev/null
}

# ---------------------------------------------------------------------------
# pip_is_pkg_installed <pkg> — check if a pip package is installed
#
# Returns 0 if installed, 1 otherwise.
# ---------------------------------------------------------------------------
pip_is_pkg_installed() {
    local pkg="$1"

    if [[ -z "$pkg" ]]; then
        log_error "pip_is_pkg_installed: package name is required."
        return 1
    fi

    local pip_cmd
    pip_cmd="$(_get_pip_cmd)" || {
        log_error "pip_is_pkg_installed: pip not found."
        return 1
    }

    # pip show returns 0 if the package is installed
    if "$pip_cmd" show "$pkg" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# ---------------------------------------------------------------------------
# pip_install_packages <pkg...> — batch install pip packages
#
# Installs one or more packages via pip install.
# ---------------------------------------------------------------------------
pip_install_packages() {
    if [[ $# -eq 0 ]]; then
        log_error "pip_install_packages: at least one package name is required."
        return 1
    fi

    local pip_cmd
    pip_cmd="$(_get_pip_cmd)" || {
        log_error "pip_install_packages: pip not found."
        return 1
    }

    # Install with minimal output
    # PEP 668: On systems with externally-managed Python (Ubuntu 24.04+),
    # pip refuses system-wide installs unless explicitly permitted.
    local -a pip_args=(install --quiet)
    
    if [[ -z "${VIRTUAL_ENV:-}" ]]; then
        # Check if --break-system-packages is supported and required
        if "$pip_cmd" install --help 2>/dev/null | grep -q -- '--break-system-packages'; then
            pip_args+=(--break-system-packages)
        fi
    fi
    
    "$pip_cmd" "${pip_args[@]}" "$@" 2>&1 | while IFS= read -r line; do
        [[ -n "$line" ]] && log_info "  [pip] $line"
    done

    return "${PIPESTATUS[0]}"
}

# ---------------------------------------------------------------------------
# Direct execution support (for testing)
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
    set -euo pipefail

    case "${1:-}" in
        available)
            pip_is_available && echo "pip is available" || echo "pip is not available"
            ;;
        check)
            shift
            pip_is_pkg_installed "$@"
            ;;
        install)
            shift
            pip_install_packages "$@"
            ;;
        *)
            echo "Usage: $(basename "$0") {available|check <pkg>|install <pkg...>}"
            exit 1
            ;;
    esac
fi

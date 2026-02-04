#!/usr/bin/env bash
# handler-npm.sh — NPM global package handler (cross-distribution).
#
# This handler installs global npm packages and works on any distribution
# where Node.js and npm are installed.
#
# Functions exported:
#   npm_is_available           — check if npm is available
#   npm_is_pkg_installed <pkg> — check if a global package is installed
#   npm_install_packages <pkg...> — batch install global packages
#
# This file is safe to source multiple times (idempotent guard).

# Guard against double-sourcing
[[ -n "${_HANDLER_NPM_LOADED:-}" ]] && return 0
readonly _HANDLER_NPM_LOADED=1

# ---------------------------------------------------------------------------
# Logging — source shared logging utilities
# ---------------------------------------------------------------------------
readonly _HANDLER_DIR="${_HANDLER_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)}"
# shellcheck source=/dev/null
[[ -f "${_HANDLER_DIR}/handler-logging.sh" ]] && source "${_HANDLER_DIR}/handler-logging.sh"
source_logging_stubs

# ---------------------------------------------------------------------------
# npm_is_available — check if npm is available on the system
# ---------------------------------------------------------------------------
npm_is_available() {
    if ! command -v npm &>/dev/null; then
        return 1
    fi
    return 0
}

# ---------------------------------------------------------------------------
# npm_is_pkg_installed <pkg> — check if a global npm package is installed
#
# Returns 0 if installed, 1 otherwise.
# ---------------------------------------------------------------------------
npm_is_pkg_installed() {
    local pkg="$1"

    if [[ -z "$pkg" ]]; then
        log_error "npm_is_pkg_installed: package name is required."
        return 1
    fi

    if ! npm_is_available; then
        log_error "npm_is_pkg_installed: npm not found."
        return 1
    fi

    # Strategy 1: Try JSON output (more reliable, requires jq)
    # This is more stable across npm versions than parsing tree output
    if command -v jq &>/dev/null; then
        if npm list -g --depth=0 --json 2>/dev/null | \
           jq -e ".dependencies[\"$pkg\"] != null" &>/dev/null 2>&1; then
            return 0
        fi
    fi
    
    # Strategy 2: Fallback to tree pattern matching
    # npm list -g --depth=0 returns exit code 0 even if the package is not found,
    # so we need to check the output. Use tree structure pattern to avoid false
    # positives (e.g., "react" matching "react-dom").
    if npm list -g --depth=0 "$pkg" 2>/dev/null | grep -qE "^[├└]──\\s+${pkg}@"; then
        return 0
    fi
    
    return 1
}

# ---------------------------------------------------------------------------
# npm_install_packages <pkg...> — batch install global npm packages
#
# Installs one or more packages via npm install -g.
# ---------------------------------------------------------------------------
npm_install_packages() {
    if [[ $# -eq 0 ]]; then
        log_error "npm_install_packages: at least one package name is required."
        return 1
    fi

    if ! npm_is_available; then
        log_error "npm_install_packages: npm not found."
        return 1
    fi

    # Install globally with minimal output
    npm install -g --quiet "$@" 2>&1 | while IFS= read -r line; do
        [[ -n "$line" ]] && log_info "  [npm] $line"
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
            npm_is_available && echo "npm is available" || echo "npm is not available"
            ;;
        check)
            shift
            npm_is_pkg_installed "$@"
            ;;
        install)
            shift
            npm_install_packages "$@"
            ;;
        *)
            echo "Usage: $(basename "$0") {available|check <pkg>|install <pkg...>}"
            exit 1
            ;;
    esac
fi

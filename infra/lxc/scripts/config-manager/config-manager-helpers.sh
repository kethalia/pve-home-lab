#!/usr/bin/env bash
# config-manager-helpers.sh — Shared utility functions for the config manager.
#
# Provides environment detection, helper functions, and common variables that
# are sourced by both the main config-sync.sh orchestrator and by individual
# user-authored container scripts executed via execute-scripts.sh.
#
# Functions exported:
#   detect_container_os       — populate CONTAINER_OS / CONTAINER_OS_VERSION
#   detect_container_user     — populate CONTAINER_USER (auto or from config)
#   detect_package_manager    — populate _PKG_MGR (apt|apk|dnf|yum)
#   is_installed <cmd>        — return 0 if command exists on PATH
#   ensure_installed <pkg>    — install a package if not already present
#   export_script_env         — export all CONFIG_MANAGER_* / CONTAINER_* vars
#
# This file is safe to source multiple times (idempotent guard).

# Guard against double-sourcing
[[ -n "${_CONFIG_MANAGER_HELPERS_LOADED:-}" ]] && return 0
readonly _CONFIG_MANAGER_HELPERS_LOADED=1

# ---------------------------------------------------------------------------
# Logging — provide stubs when not sourced from config-sync.sh
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
# OS detection — reads /etc/os-release
# ---------------------------------------------------------------------------
detect_container_os() {
    CONTAINER_OS="unknown"
    CONTAINER_OS_VERSION="unknown"

    if [[ -f /etc/os-release ]]; then
        # Parse os-release in a subshell to avoid polluting the current
        # environment (os-release defines VERSION, NAME, etc. which would
        # clobber config-manager variables like VERSION).
        local os_id os_id_like os_version_id
        os_id="$(. /etc/os-release && echo "${ID:-unknown}")"
        os_id_like="$(. /etc/os-release && echo "${ID_LIKE:-}")"
        os_version_id="$(. /etc/os-release && echo "${VERSION_ID:-unknown}")"

        # Normalise ID to lower-case short name
        case "$os_id" in
            ubuntu|debian|alpine|fedora|centos|rhel|rocky|almalinux)
                CONTAINER_OS="$os_id"
                ;;
            *)
                # Fallback: try ID_LIKE for derivatives
                if [[ "$os_id_like" == *debian* ]]; then
                    CONTAINER_OS="debian"
                elif [[ "$os_id_like" == *rhel* ]] || [[ "$os_id_like" == *fedora* ]]; then
                    CONTAINER_OS="fedora"
                else
                    CONTAINER_OS="$os_id"
                fi
                ;;
        esac

        CONTAINER_OS_VERSION="$os_version_id"
    else
        log_warn "Cannot detect OS — /etc/os-release not found."
    fi

    export CONTAINER_OS CONTAINER_OS_VERSION
    log_info "Detected OS: ${CONTAINER_OS} ${CONTAINER_OS_VERSION}"
}

# ---------------------------------------------------------------------------
# User detection — reliable auto-detect with config override
# ---------------------------------------------------------------------------
detect_container_user() {
    # 1. Honour explicit config override (CONFIG_CONTAINER_USER in config.env)
    if [[ -n "${CONFIG_CONTAINER_USER:-}" ]]; then
        CONTAINER_USER="$CONFIG_CONTAINER_USER"
        export CONTAINER_USER
        log_info "Container user (from config): ${CONTAINER_USER}"
        return 0
    fi

    # 2. Auto-detect: first non-root user with UID >= 1000 and a valid shell
    local detected_user=""
    detected_user="$(getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 && $7 !~ /nologin|false/ {print $1; exit}')"

    if [[ -z "$detected_user" ]]; then
        # 3. Fallback: look for home directories
        local home_candidate
        home_candidate="$(find /home -maxdepth 1 -mindepth 1 -type d -printf '%f\n' 2>/dev/null | head -1)"
        detected_user="${home_candidate:-}"
    fi

    # 4. Final fallback
    CONTAINER_USER="${detected_user:-coder}"
    export CONTAINER_USER
    log_info "Container user (auto-detected): ${CONTAINER_USER}"
}

# ---------------------------------------------------------------------------
# Package manager detection
# ---------------------------------------------------------------------------
detect_package_manager() {
    if command -v apt-get &>/dev/null; then
        _PKG_MGR="apt"
    elif command -v apk &>/dev/null; then
        _PKG_MGR="apk"
    elif command -v dnf &>/dev/null; then
        _PKG_MGR="dnf"
    elif command -v yum &>/dev/null; then
        _PKG_MGR="yum"
    else
        _PKG_MGR="unknown"
        log_warn "No supported package manager found (apt, apk, dnf, yum)."
    fi

    export _PKG_MGR
}

# ---------------------------------------------------------------------------
# is_installed <cmd> — check if a command is available
# ---------------------------------------------------------------------------
is_installed() {
    if [[ $# -ne 1 ]]; then
        log_error "is_installed: expected 1 argument, got $#"
        return 1
    fi
    command -v "$1" &>/dev/null
}

# ---------------------------------------------------------------------------
# ensure_installed <pkg> — install a package if not already present
#
# Uses the auto-detected package manager. The package name should be the
# canonical name for the container's distribution.
# ---------------------------------------------------------------------------
ensure_installed() {
    if [[ $# -ne 1 ]]; then
        log_error "ensure_installed: expected 1 argument, got $#"
        return 1
    fi

    local pkg="$1"

    # Quick check: if a command with the same name as the package exists, skip
    if command -v "$pkg" &>/dev/null; then
        log_info "ensure_installed: '${pkg}' is already available."
        return 0
    fi

    # Ensure we know which package manager to use
    [[ -z "${_PKG_MGR:-}" ]] && detect_package_manager

    log_info "ensure_installed: installing '${pkg}' via ${_PKG_MGR} ..."

    case "$_PKG_MGR" in
        apt)
            apt-get update -qq && apt-get install -y -qq "$pkg"
            ;;
        apk)
            apk add --quiet "$pkg"
            ;;
        dnf)
            dnf install -y -q "$pkg"
            ;;
        yum)
            yum install -y -q "$pkg"
            ;;
        *)
            log_error "ensure_installed: unsupported package manager '${_PKG_MGR}'."
            return 1
            ;;
    esac

    log_info "ensure_installed: '${pkg}' installed successfully."
}

# ---------------------------------------------------------------------------
# First-run detection
# ---------------------------------------------------------------------------
detect_first_run() {
    # First run = the repo directory doesn't have a previous sync marker
    local marker="/var/log/config-manager/.first-run-complete"
    if [[ -f "$marker" ]]; then
        CONFIG_MANAGER_FIRST_RUN="false"
    else
        CONFIG_MANAGER_FIRST_RUN="true"
    fi
    export CONFIG_MANAGER_FIRST_RUN
}

mark_first_run_complete() {
    local marker="/var/log/config-manager/.first-run-complete"
    touch "$marker" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# export_script_env — export all environment variables for user scripts
#
# Must be called AFTER detect_container_os, detect_container_user, and
# after config-sync.sh has set VERSION, REPO_DIR, LOG_FILE.
# ---------------------------------------------------------------------------
export_script_env() {
    # Core config-manager variables (inherit from config-sync.sh or use defaults)
    export CONFIG_MANAGER_VERSION="${VERSION:-0.0.0}"
    export CONFIG_MANAGER_ROOT="${REPO_DIR:-/opt/config-manager/repo}"
    export CONFIG_MANAGER_LOG="${LOG_FILE:-/var/log/config-manager/sync.log}"

    # These should already be exported by their detect_* functions, but be safe
    export CONTAINER_OS="${CONTAINER_OS:-unknown}"
    export CONTAINER_OS_VERSION="${CONTAINER_OS_VERSION:-unknown}"
    export CONTAINER_USER="${CONTAINER_USER:-coder}"
    export CONFIG_MANAGER_FIRST_RUN="${CONFIG_MANAGER_FIRST_RUN:-false}"
}

# ---------------------------------------------------------------------------
# run_as_user — Run command as container user with proper environment
#
# Usage: run_as_user command [args...]
#        run_as_user bash -c "node --version"
#
# Problem: sudo restricts PATH by default, causing scripts with #!/usr/bin/env
# shebangs to fail because env can't find bash/node/etc in PATH.
#
# Solution: Explicitly set full PATH and HOME when running as user.
# ---------------------------------------------------------------------------
run_as_user() {
    sudo -u "$CONTAINER_USER" env \
        PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/$CONTAINER_USER/.local/bin:/home/$CONTAINER_USER/.foundry/bin:/home/$CONTAINER_USER/.nvm/versions/node/*/bin" \
        HOME="/home/$CONTAINER_USER" \
        USER="$CONTAINER_USER" \
        "$@"
}

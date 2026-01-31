#!/usr/bin/env bash
# config-sync.sh — Main orchestration script for LXC configuration management.
#
# This script is the entry point invoked by the config-manager systemd service
# on every boot. It synchronises a git repository of declarative container
# configurations and delegates work to phase-specific handlers.
#
# Exit codes:
#   0  — success
#   1  — general / unexpected error
#   2  — lock acquisition failed (another instance running)
#   3  — configuration error (missing / invalid config)
#   4  — git operation failed (and no cached state available)

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly CONFIG_FILE="/etc/config-manager/config.env"
readonly LOCK_FILE="/run/config-manager/config-manager.lock"
readonly LOG_DIR="/var/log/config-manager"
readonly LOG_FILE="${LOG_DIR}/sync.log"
readonly REPO_DIR="/opt/config-manager/repo"
readonly LIB_DIR="/usr/local/lib/config-manager"
readonly VERSION="0.3.0"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
_log() {
    local level="$1"; shift
    local ts
    ts="$(date '+%Y-%m-%d %H:%M:%S')"
    printf '[%s] [%-7s] %s\n' "$ts" "$level" "$*" | tee -a "$LOG_FILE"
}

log_info()  { _log INFO  "$@"; }
log_warn()  { _log WARNING "$@"; }
log_error() { _log ERROR  "$@"; }

# ---------------------------------------------------------------------------
# Lock management
# ---------------------------------------------------------------------------
acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local pid
        pid="$(cat "$LOCK_FILE" 2>/dev/null || true)"
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log_error "Another instance is running (PID $pid). Exiting."
            return 2
        fi
        log_warn "Stale lock file found (PID $pid). Removing."
        rm -f "$LOCK_FILE"
    fi

    echo $$ > "$LOCK_FILE"
    log_info "Lock acquired (PID $$)."
}

release_lock() {
    rm -f "$LOCK_FILE"
    log_info "Lock released."
}

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "Configuration file not found: $CONFIG_FILE"
        return 3
    fi

    # Warn if config file has overly permissive permissions
    local file_perms
    file_perms="$(stat -c %a "$CONFIG_FILE" 2>/dev/null || true)"
    if [ -n "$file_perms" ] && [ "$file_perms" != "600" ]; then
        log_warn "Config file permissions are $file_perms — expected 600. Consider: chmod 600 $CONFIG_FILE"
    fi

    # Source the config — expected variables:
    #   CONFIG_REPO_URL   — git clone URL
    #   CONFIG_BRANCH     — branch to track (default: main)
    #   CONFIG_PATH       — sub-path inside repo for container configs
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"

    # Validate required variables
    if [ -z "${CONFIG_REPO_URL:-}" ]; then
        log_error "CONFIG_REPO_URL is not set in $CONFIG_FILE"
        return 3
    fi

    # Validate repository URL format
    if [[ ! "$CONFIG_REPO_URL" =~ ^(https?://|git@) ]]; then
        log_error "CONFIG_REPO_URL must be an HTTP(S) or SSH URL: $CONFIG_REPO_URL"
        return 3
    fi

    CONFIG_BRANCH="${CONFIG_BRANCH:-main}"
    CONFIG_PATH="${CONFIG_PATH:-infra/lxc/container-configs}"

    log_info "Configuration loaded — repo: $CONFIG_REPO_URL (branch: $CONFIG_BRANCH)"
}

# ---------------------------------------------------------------------------
# Git synchronisation
# ---------------------------------------------------------------------------
git_sync() {
    log_info "Starting git synchronisation..."

    # Ensure parent directory exists
    mkdir -p "$(dirname "$REPO_DIR")"

    if [ -d "${REPO_DIR}/.git" ]; then
        # Existing clone — pull latest changes
        log_info "Repository already cloned. Pulling latest changes..."
        if git -C "$REPO_DIR" fetch --quiet origin "$CONFIG_BRANCH" 2>/dev/null; then
            local local_rev remote_rev
            local_rev="$(git -C "$REPO_DIR" rev-parse HEAD)"
            remote_rev="$(git -C "$REPO_DIR" rev-parse "origin/$CONFIG_BRANCH")"

            if [ "$local_rev" = "$remote_rev" ]; then
                log_info "Already up to date ($local_rev)."
            else
                git -C "$REPO_DIR" reset --hard "origin/$CONFIG_BRANCH" --quiet
                log_info "Updated: $local_rev -> $remote_rev"
            fi
        else
            log_warn "Network unreachable — continuing with cached state ($(git -C "$REPO_DIR" rev-parse --short HEAD))."
        fi
    else
        # First run — full clone
        log_info "First run detected. Cloning repository..."
        if git clone --branch "$CONFIG_BRANCH" --single-branch --depth 1 \
                "$CONFIG_REPO_URL" "$REPO_DIR" 2>/dev/null; then
            log_info "Repository cloned successfully ($(git -C "$REPO_DIR" rev-parse --short HEAD))."
        else
            log_error "Failed to clone repository. Is the network available?"
            # If there is no cached state at all, we cannot continue.
            return 4
        fi
    fi
}

# ---------------------------------------------------------------------------
# Repository structure validation
# ---------------------------------------------------------------------------
validate_repo() {
    local config_root="${REPO_DIR}/${CONFIG_PATH}"

    if [ ! -d "$config_root" ]; then
        log_warn "Config path not found in repo: $CONFIG_PATH — skipping orchestration phases."
        log_warn "This is expected on first setup before container configs are committed."
        return 0
    fi

    log_info "Repository structure validated — config root: $config_root"
}

# ---------------------------------------------------------------------------
# Orchestration phase stubs
# ---------------------------------------------------------------------------
# Each phase will be implemented in its own issue and script. For now we log
# a placeholder message so operators know the framework is wired up.

phase_snapshot() {
    log_info "[Phase: Snapshot] Not yet implemented — see Issue #42 (System snapshot creation & management)."
}

phase_execute_scripts() {
    local execute_scripts_file="${LIB_DIR}/execute-scripts.sh"

    if [[ -f "$execute_scripts_file" ]]; then
        # shellcheck source=/dev/null
        source "$execute_scripts_file"
        execute_scripts
    else
        log_warn "[Phase: Scripts] execute-scripts.sh not found at ${execute_scripts_file} — skipping."
    fi
}

phase_process_files() {
    local process_files_script="${LIB_DIR}/process-files.sh"

    if [[ -f "$process_files_script" ]]; then
        # shellcheck source=/dev/null
        source "$process_files_script"
        process_files
    else
        log_warn "[Phase: Files] process-files.sh not found at ${process_files_script} — skipping."
    fi
}

phase_install_packages() {
    log_info "[Phase: Packages] Not yet implemented — see Issue #44/#45 (Cross-distribution & custom package management)."
}

# ---------------------------------------------------------------------------
# Cleanup & summary
# ---------------------------------------------------------------------------
log_summary() {
    local end_ts
    end_ts="$(date '+%Y-%m-%d %H:%M:%S')"
    log_info "─────────────────────────────────────"
    log_info "Sync completed at $end_ts"
    log_info "─────────────────────────────────────"
}

# ---------------------------------------------------------------------------
# Trap for cleanup on exit (success or failure)
# ---------------------------------------------------------------------------
cleanup() {
    release_lock
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    # Ensure log directory exists
    mkdir -p "$LOG_DIR"

    log_info "========================================="
    log_info "config-sync v${VERSION} starting (PID $$)"
    log_info "========================================="

    # Step 1 — Acquire lock
    acquire_lock || exit $?

    # Step 2 — Load configuration
    load_config || exit $?

    # Step 3 — Create snapshot (future — Issue #42)
    phase_snapshot

    # Step 4 — Git clone / pull
    git_sync || exit $?

    # Step 5 — Validate repo structure
    validate_repo

    # Step 6 — Execute scripts (future — Issue #41)
    phase_execute_scripts

    # Step 7 — Process files (future — Issue #40)
    phase_process_files

    # Step 8 — Install packages (future — Issue #44/#45)
    phase_install_packages

    # Step 9 — Summary
    log_summary

    log_info "config-sync completed successfully."
}

main "$@"

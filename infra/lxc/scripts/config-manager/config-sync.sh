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
#   5  — conflicts detected between local changes and git updates

# Note: We use 'set -eo pipefail' without -u to avoid issues with kcov instrumentation
# and BASH_SOURCE in certain sourcing contexts (e.g., bash -c "source ...")
set -eo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly CONFIG_FILE="/etc/config-manager/config.env"
readonly LOCK_FILE="/run/config-manager/config-manager.lock"
readonly LOG_DIR="/var/log/config-manager"
readonly LOG_FILE="${LOG_DIR}/sync.log"
readonly REPO_DIR="/opt/config-manager/repo"
readonly LIB_DIR="/usr/local/lib/config-manager"
readonly CONFIG_SYNC_VERSION="0.4.0"

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
    #   CONFIG_REPO_URL     — git clone URL
    #   CONFIG_BRANCH       — branch to track (default: main)
    #   CONFIG_PATH         — sub-path inside repo for container configs
    #   CONFIG_HELPER_PATH  — path to helper scripts (default: infra/lxc/scripts/config-manager)
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
    CONFIG_HELPER_PATH="${CONFIG_HELPER_PATH:-infra/lxc/scripts/config-manager}"

    log_info "Configuration loaded — repo: $CONFIG_REPO_URL (branch: $CONFIG_BRANCH)"
}

# ---------------------------------------------------------------------------
# Ensure dependencies are installed
# ---------------------------------------------------------------------------
ensure_git() {
    if command -v git &>/dev/null; then
        log_info "git is already installed."
        return 0
    fi

    log_info "git not found. Installing git..."
    
    # Detect package manager
    if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y -qq git
    elif command -v dnf &>/dev/null; then
        dnf install -y -q git
    elif command -v apk &>/dev/null; then
        apk add --quiet git
    else
        log_error "Unsupported package manager. Cannot install git."
        return 1
    fi

    if command -v git &>/dev/null; then
        log_info "git installed successfully."
    else
        log_error "Failed to install git."
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Ensure helper scripts are available
# ---------------------------------------------------------------------------
ensure_helpers() {
    # Check if all required helpers exist
    local -a required_helpers=(
        "${LIB_DIR}/config-manager-helpers.sh"
        "${LIB_DIR}/execute-scripts.sh"
        "${LIB_DIR}/process-files.sh"
        "${LIB_DIR}/snapshot-manager.sh"
        "${LIB_DIR}/conflict-detector.sh"
    )

    local missing_helpers="false"
    for helper in "${required_helpers[@]}"; do
        if [[ ! -f "$helper" ]]; then
            missing_helpers="true"
            break
        fi
    done

    # Check if package handlers exist
    if [[ ! -d "${LIB_DIR}/package-handlers" ]] || [[ -z "$(ls -A "${LIB_DIR}/package-handlers" 2>/dev/null)" ]]; then
        missing_helpers="true"
    fi

    if [[ "$missing_helpers" == "false" ]]; then
        log_info "All helper scripts are already installed."
        return 0
    fi

    log_info "Helper scripts not found. Downloading from repository..."

    # Create temp directory for helper download
    local temp_helper_dir=""
    temp_helper_dir="$(mktemp -d -t config-manager-helpers-XXXXXX)"

    # Clone repo to temp location to get helpers
    log_info "Cloning repository to retrieve helper scripts..."
    if ! git clone --depth 1 --branch "${CONFIG_BRANCH}" "${CONFIG_REPO_URL}" "${temp_helper_dir}" &>/dev/null; then
        log_error "Failed to clone repository for helper scripts."
        rm -rf "${temp_helper_dir}"
        return 1
    fi

    # Create lib directory if it doesn't exist
    mkdir -p "${LIB_DIR}/package-handlers"

    # Copy helper scripts using configured path
    local helper_source_dir="${temp_helper_dir}/${CONFIG_HELPER_PATH}"
    
    if [[ ! -d "$helper_source_dir" ]]; then
        log_error "Helper source directory not found: ${CONFIG_HELPER_PATH}"
        log_error "Check CONFIG_HELPER_PATH in /etc/config-manager/config.env"
        rm -rf "${temp_helper_dir}"
        return 1
    fi
    
    log_info "Installing helper scripts from ${CONFIG_HELPER_PATH}..."
    for helper in "${required_helpers[@]}"; do
        local helper_name
        helper_name="$(basename "$helper")"
        if [[ -f "${helper_source_dir}/${helper_name}" ]]; then
            cp "${helper_source_dir}/${helper_name}" "$helper"
            chmod 755 "$helper"
            log_info "  → Installed ${helper_name}"
        else
            log_warn "  → Helper not found: ${helper_name}"
        fi
    done

    # Copy package handlers
    if [[ -d "${helper_source_dir}/package-handlers" ]]; then
        local handler_count=0
        if cp "${helper_source_dir}/package-handlers"/*.sh "${LIB_DIR}/package-handlers/" 2>/dev/null; then
            chmod 755 "${LIB_DIR}/package-handlers"/*.sh 2>/dev/null || true
            handler_count=$(find "${LIB_DIR}/package-handlers" -name "*.sh" -type f | wc -l)
            log_info "  → Installed ${handler_count} package handler(s)"
        else
            log_warn "  → No package handlers found or copy failed"
        fi
    else
        log_warn "  → Package handlers directory not found"
    fi

    # Copy config-rollback CLI if it exists
    if [[ -f "${helper_source_dir}/config-rollback.sh" ]]; then
        cp "${helper_source_dir}/config-rollback.sh" /usr/local/bin/config-rollback
        chmod 755 /usr/local/bin/config-rollback
        log_info "  → Installed config-rollback CLI"
    fi

    # Cleanup temp directory
    rm -rf "${temp_helper_dir}"

    log_info "Helper scripts installed successfully."
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
# Orchestration phases
# ---------------------------------------------------------------------------

phase_snapshot() {
    local snapshot_script="${LIB_DIR}/snapshot-manager.sh"

    if [[ ! -f "$snapshot_script" ]]; then
        log_warn "[Phase: Snapshot] snapshot-manager.sh not found at ${snapshot_script} — skipping."
        return 0
    fi

    # Source snapshot-manager so it inherits our logging functions
    # shellcheck source=/dev/null
    source "$snapshot_script"

    load_snapshot_config || {
        log_warn "[Phase: Snapshot] Invalid snapshot configuration — skipping."
        return 0
    }

    detect_backend || {
        log_warn "[Phase: Snapshot] Backend detection failed — skipping."
        return 0
    }

    # Check if enabled — exit code 2 means disabled (not an error)
    if ! check_enabled; then
        return 0
    fi

    log_info "[Phase: Snapshot] Creating pre-sync snapshot..."
    if do_create; then
        log_info "[Phase: Snapshot] Pre-sync snapshot created successfully."
    else
        log_warn "[Phase: Snapshot] Snapshot creation failed — continuing without snapshot."
    fi
}

phase_snapshot_post_success() {
    # Tag the snapshot as good and clean up old ones after a successful sync
    if ! declare -f tag_good &>/dev/null; then
        return 0
    fi

    log_info "[Phase: Snapshot] Tagging snapshot as good and cleaning up..."
    tag_good || true
    do_cleanup || true
}

phase_conflict_pre_sync() {
    local conflict_script="${LIB_DIR}/conflict-detector.sh"

    if [[ ! -f "$conflict_script" ]]; then
        log_warn "[Phase: Conflict] conflict-detector.sh not found at ${conflict_script} — skipping."
        return 0
    fi

    # shellcheck source=/dev/null
    source "$conflict_script"

    log_info "[Phase: Conflict] Recording pre-sync checksums..."
    record_pre_sync_checksums
}

phase_conflict_detect() {
    # Only run if conflict-detector was loaded in phase_conflict_pre_sync
    if ! declare -f detect_conflicts &>/dev/null; then
        return 0
    fi

    log_info "[Phase: Conflict] Checking for conflicts after git pull..."
    if ! detect_conflicts; then
        log_error "[Phase: Conflict] Conflicts detected — aborting sync."
        log_error "[Phase: Conflict] Run 'config-rollback status' for details."
        return $EXIT_CONFLICT
    fi

    log_info "[Phase: Conflict] No conflicts detected — proceeding with sync."
}

phase_conflict_post_success() {
    # Save checksums after successful sync for next run's comparison
    if declare -f save_successful_checksums &>/dev/null; then
        save_successful_checksums
    fi
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
    local handler_common="${LIB_DIR}/package-handlers/handler-common.sh"

    if [[ ! -f "$handler_common" ]]; then
        log_warn "[Phase: Packages] handler-common.sh not found at ${handler_common} — skipping."
        return 0
    fi

    # shellcheck source=/dev/null
    source "$handler_common"

    # Source helpers if not already loaded (provides detect_package_manager, detect_container_os)
    local helpers_script="${LIB_DIR}/config-manager-helpers.sh"
    if [[ -f "$helpers_script" ]] && ! declare -f detect_package_manager &>/dev/null; then
        # shellcheck source=/dev/null
        source "$helpers_script"
    fi

    # Run package installation
    local packages_dir="${REPO_DIR}/${CONFIG_PATH}/packages"
    log_info "[Phase: Packages] Processing packages from ${packages_dir}"

    if declare -f install_packages &>/dev/null; then
        if ! install_packages "$packages_dir"; then
            log_warn "[Phase: Packages] Package installation completed with failures."
            # Don't abort sync - continue with remaining phases (fail-safe at phase level)
        fi
    else
        log_error "[Phase: Packages] install_packages function not found — skipping."
    fi
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
    log_info "config-sync v${CONFIG_SYNC_VERSION} starting (PID $$)"
    log_info "========================================="

    # Step 1 — Acquire lock
    acquire_lock || exit $?

    # Step 2 — Load configuration
    load_config || exit $?

    # Step 2.5 — Ensure git is installed
    ensure_git || exit $?

    # Step 2.6 — Ensure helper scripts are available
    ensure_helpers || exit $?

    # Step 3 — Create pre-sync snapshot (Issue #42)
    phase_snapshot

    # Step 4 — Record pre-sync checksums for conflict detection (Issue #43)
    phase_conflict_pre_sync

    # Step 5 — Git clone / pull
    git_sync || exit $?

    # Step 6 — Detect conflicts between local changes and git updates (Issue #43)
    phase_conflict_detect || exit $?

    # Step 7 — Validate repo structure
    validate_repo

    # Step 8 — Execute scripts (Issue #41)
    phase_execute_scripts

    # Step 9 — Process files (Issue #40)
    phase_process_files

    # Step 10 — Install packages (future — Issue #44/#45)
    phase_install_packages

    # Step 11 — Save post-sync checksums for next conflict detection (Issue #43)
    phase_conflict_post_success

    # Step 12 — Mark snapshot as good and cleanup old snapshots
    phase_snapshot_post_success

    # Step 13 — Summary
    log_summary

    log_info "config-sync completed successfully."
}

main "$@"

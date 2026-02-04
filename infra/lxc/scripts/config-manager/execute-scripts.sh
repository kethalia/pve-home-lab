#!/usr/bin/env bash
# execute-scripts.sh — Script execution engine with alphabetical ordering.
#
# Runs .sh files from the container-configs/scripts/ directory in LC_ALL=C
# sorted order. Each script runs sequentially as root; a non-zero exit code
# from any script halts the entire chain.
#
# This script is sourced/called by config-sync.sh and expects the following
# functions and variables to be available:
#   log_info, log_warn, log_error  — logging helpers
#   REPO_DIR, CONFIG_PATH          — repository paths
#   VERSION, LOG_FILE              — config-sync constants
#
# It can also be run standalone for testing:
#   REPO_DIR=/opt/config-manager/repo CONFIG_PATH=infra/lxc/container-configs \
#     bash execute-scripts.sh [--dry-run]

# Note: We use 'set -eo pipefail' without -u to avoid issues with kcov instrumentation
# and BASH_SOURCE in certain sourcing contexts (e.g., bash -c "source ...")
set -eo pipefail

# ---------------------------------------------------------------------------
# Standalone mode: provide logging stubs if not sourced from config-sync.sh
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
# Source shared helpers (provides is_installed, ensure_installed, detect_*, etc.)
# ---------------------------------------------------------------------------
_HELPERS_PATH="${LIB_DIR:-/usr/local/lib/config-manager}/config-manager-helpers.sh"
if [[ -f "$_HELPERS_PATH" ]]; then
    # shellcheck source=config-manager-helpers.sh
    source "$_HELPERS_PATH"
else
    # Fallback: try path relative to this script (development / testing)
    _SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
    if [[ -f "${_SCRIPT_DIR}/config-manager-helpers.sh" ]]; then
        # shellcheck source=config-manager-helpers.sh
        source "${_SCRIPT_DIR}/config-manager-helpers.sh"
    else
        log_warn "config-manager-helpers.sh not found — helper functions (is_installed, ensure_installed) will not be available to scripts."
    fi
fi

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
SCRIPTS_FOUND=0
SCRIPTS_EXECUTED=0
SCRIPTS_SKIPPED=0

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
DRY_RUN=false
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
    esac
done

# ---------------------------------------------------------------------------
# setup_script_environment — detect OS, user, pkg manager and export vars
# ---------------------------------------------------------------------------
setup_script_environment() {
    # Run detection routines (from config-manager-helpers.sh)
    if declare -f detect_container_os &>/dev/null; then
        detect_container_os
    fi

    if declare -f detect_container_user &>/dev/null; then
        detect_container_user
    fi

    if declare -f detect_package_manager &>/dev/null; then
        detect_package_manager
    fi

    if declare -f detect_first_run &>/dev/null; then
        detect_first_run
    fi

    if declare -f export_script_env &>/dev/null; then
        export_script_env
    fi

    log_info "[Phase: Scripts] Environment ready — OS=${CONTAINER_OS:-unknown} user=${CONTAINER_USER:-unknown} pkg=${_PKG_MGR:-unknown} first_run=${CONFIG_MANAGER_FIRST_RUN:-unknown}"
}

# ---------------------------------------------------------------------------
# run_single_script — execute one script with output capture and error handling
# ---------------------------------------------------------------------------
run_single_script() {
    local script_path="$1"
    local script_name
    script_name="$(basename "$script_path")"

    # Verify the file is a regular file
    if [[ ! -f "$script_path" ]]; then
        log_warn "[Phase: Scripts] Not a regular file, skipping: ${script_name}"
        (( SCRIPTS_SKIPPED++ )) || true
        return 0
    fi

    # Ensure executable permission
    if [[ ! -x "$script_path" ]]; then
        log_warn "[Phase: Scripts] '${script_name}' is not executable — setting +x and continuing."
        if [[ "$DRY_RUN" == false ]]; then
            chmod +x "$script_path"
        fi
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would execute: ${script_name}"
        (( SCRIPTS_EXECUTED++ )) || true
        return 0
    fi

    log_info "[Phase: Scripts] ── Executing: ${script_name} ──"

    # Execute the script in a subshell to isolate side-effects on the engine
    # itself, while still providing the exported environment variables and
    # sourced helper functions.
    #
    # We capture both stdout and stderr, tee-ing them to the sync log.
    local exit_code=0
    (
        # Re-source helpers inside the subshell so user scripts get the
        # functions (is_installed, ensure_installed, log_*) directly.
        if [[ -f "$_HELPERS_PATH" ]]; then
            # shellcheck source=config-manager-helpers.sh
            source "$_HELPERS_PATH"
        elif [[ -f "${_SCRIPT_DIR:-}/config-manager-helpers.sh" ]]; then
            # shellcheck source=config-manager-helpers.sh
            source "${_SCRIPT_DIR}/config-manager-helpers.sh"
        fi

        source "$script_path"
    ) 2>&1 | while IFS= read -r line; do
        log_info "[${script_name}] ${line}"
    done
    exit_code=${PIPESTATUS[0]}

    if [[ $exit_code -ne 0 ]]; then
        log_error "[Phase: Scripts] '${script_name}' FAILED with exit code ${exit_code}."
        return "$exit_code"
    fi

    log_info "[Phase: Scripts] '${script_name}' completed successfully."
    (( SCRIPTS_EXECUTED++ )) || true
    return 0
}

# ---------------------------------------------------------------------------
# execute_scripts — main entry point
# ---------------------------------------------------------------------------
execute_scripts() {
    local scripts_dir="${REPO_DIR}/${CONFIG_PATH}/scripts"

    # --- Pre-check: scripts directory exists? ---
    if [[ ! -d "$scripts_dir" ]]; then
        log_info "[Phase: Scripts] No scripts/ directory found at ${CONFIG_PATH}/scripts — nothing to execute."
        return 0
    fi

    log_info "[Phase: Scripts] Scanning ${scripts_dir} ..."

    # --- Discover .sh files, sorted alphabetically (LC_ALL=C for stable order) ---
    local -a script_list=()
    while IFS= read -r -d '' script; do
        script_list+=("$script")
    done < <(find "$scripts_dir" -maxdepth 1 -type f -name '*.sh' -print0 | LC_ALL=C sort -z)

    SCRIPTS_FOUND=${#script_list[@]}

    if [[ $SCRIPTS_FOUND -eq 0 ]]; then
        log_warn "[Phase: Scripts] scripts/ directory exists but contains no .sh files."
        return 0
    fi

    log_info "[Phase: Scripts] Found ${SCRIPTS_FOUND} script(s) to execute."

    # --- Setup environment for scripts ---
    setup_script_environment

    # --- Sequential execution ---
    for script_path in "${script_list[@]}"; do
        if ! run_single_script "$script_path"; then
            local failed_name
            failed_name="$(basename "$script_path")"
            log_error "[Phase: Scripts] Execution chain halted due to failure in '${failed_name}'."
            log_error "[Phase: Scripts] Summary — found:${SCRIPTS_FOUND} executed:${SCRIPTS_EXECUTED} skipped:${SCRIPTS_SKIPPED} FAILED:${failed_name}"
            return 1
        fi
    done

    # --- Mark first run complete (if applicable) ---
    if declare -f mark_first_run_complete &>/dev/null; then
        mark_first_run_complete
    fi

    # --- Summary ---
    log_info "[Phase: Scripts] Complete — found:${SCRIPTS_FOUND} executed:${SCRIPTS_EXECUTED} skipped:${SCRIPTS_SKIPPED}"
    return 0
}

# ---------------------------------------------------------------------------
# Run if executed directly (not sourced)
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
    if [[ -z "${REPO_DIR:-}" ]] || [[ -z "${CONFIG_PATH:-}" ]]; then
        echo "Usage: REPO_DIR=/path/to/repo CONFIG_PATH=infra/lxc/container-configs bash $0 [--dry-run]" >&2
        exit 1
    fi
    execute_scripts
fi

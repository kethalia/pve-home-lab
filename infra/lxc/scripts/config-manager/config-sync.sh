#!/usr/bin/env bash
# =============================================================================
# config-sync.sh — Main orchestrator for the LXC Configuration Manager
#
# This script is called by the config-manager systemd service on boot.
# It pulls the latest configuration from a git repository and applies:
#   1. Filesystem snapshots (safety net)
#   2. Conflict detection (abort on manual changes vs git changes)
#   3. Boot scripts (sequential, alphabetical)
#   4. File deployment (with replace/default/backup policies)
#   5. Package installation (cross-distribution)
#
# Configuration: /etc/config-manager/config.env
# Logs:          /var/log/config-manager/sync.log
# State:         /var/lib/config-manager/
# =============================================================================
set -euo pipefail

readonly CM_VERSION="1.0.0"
readonly CM_LOCK="/var/run/config-manager.lock"
readonly CM_CONFIG="/etc/config-manager/config.env"
readonly CM_LOG_DIR="/var/log/config-manager"
readonly CM_STATE_DIR="/var/lib/config-manager"
readonly CM_BACKUP_DIR="${CM_STATE_DIR}/backups"
readonly CM_CHECKSUM_DIR="${CM_STATE_DIR}/checksums"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
_log() {
  local level="$1"; shift
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  local msg
  msg="$(printf '[%s] [%-5s] %s\n' "$ts" "$level" "$*")"
  echo "$msg"
  # Append to log file only if directory exists (may not during early failures)
  if [ -d "$CM_LOG_DIR" ]; then
    echo "$msg" >> "${CM_LOG_DIR}/sync.log" 2>/dev/null || true
  fi
}
log_info()  { _log INFO  "$@"; }
log_warn()  { _log WARN  "$@"; }
log_error() { _log ERROR "$@"; }
log_ok()    { _log OK    "$@"; }

# ---------------------------------------------------------------------------
# Lock management
# ---------------------------------------------------------------------------
acquire_lock() {
  if [ -f "$CM_LOCK" ]; then
    local pid
    pid="$(cat "$CM_LOCK" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      log_error "Another config-sync is running (PID $pid). Exiting."
      exit 1
    fi
    log_warn "Stale lock file found (PID $pid). Removing."
    rm -f "$CM_LOCK"
  fi
  echo $$ > "$CM_LOCK"
}

release_lock() {
  rm -f "$CM_LOCK"
}

# ---------------------------------------------------------------------------
# Cleanup handler
# ---------------------------------------------------------------------------
cleanup() {
  local exit_code=$?
  release_lock
  if [ "$exit_code" -ne 0 ]; then
    log_error "config-sync exited with code $exit_code"
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Load configuration
# ---------------------------------------------------------------------------
load_config() {
  if [ ! -f "$CM_CONFIG" ]; then
    log_error "Configuration file not found: $CM_CONFIG"
    log_error "Run install-config-manager.sh first."
    exit 1
  fi

  # Defaults
  REPO_URL=""
  REPO_BRANCH="main"
  REPO_DIR="/opt/config-manager/repo"
  CONFIGS_SUBDIR="infra/lxc/container-configs"
  CONTAINER_USER="coder"
  SNAPSHOT_ENABLED="auto"
  SNAPSHOT_RETENTION_DAYS="7"
  SNAPSHOT_BACKEND="auto"

  # Source config (safe: only KEY=VALUE, no command substitution)
  while IFS='=' read -r key value; do
    key="$(echo "$key" | tr -d '[:space:]')"
    value="$(echo "$value" | sed 's/^["'\'']//' | sed 's/["'\'']$//' | sed 's/#.*//' | sed 's/[[:space:]]*$//')"
    [[ -z "$key" || "$key" == \#* ]] && continue
    case "$key" in
      REPO_URL)                 REPO_URL="$value" ;;
      REPO_BRANCH)              REPO_BRANCH="$value" ;;
      REPO_DIR)                 REPO_DIR="$value" ;;
      CONFIGS_SUBDIR)           CONFIGS_SUBDIR="$value" ;;
      CONTAINER_USER)           CONTAINER_USER="$value" ;;
      SNAPSHOT_ENABLED)         SNAPSHOT_ENABLED="$value" ;;
      SNAPSHOT_RETENTION_DAYS)  SNAPSHOT_RETENTION_DAYS="$value" ;;
      SNAPSHOT_BACKEND)         SNAPSHOT_BACKEND="$value" ;;
    esac
  done < "$CM_CONFIG"

  if [ -z "$REPO_URL" ]; then
    log_error "REPO_URL is not set in $CM_CONFIG"
    exit 1
  fi

  CONFIGS_DIR="${REPO_DIR}/${CONFIGS_SUBDIR}"

  export REPO_URL REPO_BRANCH REPO_DIR CONFIGS_SUBDIR CONFIGS_DIR
  export CONTAINER_USER SNAPSHOT_ENABLED SNAPSHOT_RETENTION_DAYS SNAPSHOT_BACKEND
}

# ---------------------------------------------------------------------------
# Detect environment
# ---------------------------------------------------------------------------
detect_environment() {
  # Detect OS
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    CONTAINER_OS="${ID:-unknown}"
    CONTAINER_OS_VERSION="${VERSION_ID:-unknown}"
  else
    CONTAINER_OS="unknown"
    CONTAINER_OS_VERSION="unknown"
  fi

  # Detect first run
  if [ -f "${CM_STATE_DIR}/last-sync" ]; then
    CONFIG_MANAGER_FIRST_RUN="false"
  else
    CONFIG_MANAGER_FIRST_RUN="true"
  fi

  export CONTAINER_OS CONTAINER_OS_VERSION CONFIG_MANAGER_FIRST_RUN
  export CONFIG_MANAGER_VERSION="$CM_VERSION"
  export CONFIG_MANAGER_ROOT="$CONFIGS_DIR"
  export CONFIG_MANAGER_LOG="${CM_LOG_DIR}/sync.log"
}

# ---------------------------------------------------------------------------
# Git sync
# ---------------------------------------------------------------------------
git_sync() {
  log_info "Syncing repository: $REPO_URL (branch: $REPO_BRANCH)"

  if [ ! -d "$REPO_DIR/.git" ]; then
    log_info "Cloning repository for the first time..."
    if ! git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$REPO_DIR" 2>&1 | tee -a "${CM_LOG_DIR}/sync.log"; then
      log_error "Git clone failed. Check REPO_URL and network connectivity."
      if [ "$CONFIG_MANAGER_FIRST_RUN" = "true" ]; then
        log_error "First run — cannot continue without repository."
        exit 1
      fi
      log_warn "Using cached repository state."
      return 1
    fi
    log_ok "Repository cloned successfully."
  else
    log_info "Pulling latest changes..."
    if ! git -C "$REPO_DIR" fetch --depth 1 origin "$REPO_BRANCH" 2>&1 | tee -a "${CM_LOG_DIR}/sync.log"; then
      log_warn "Git fetch failed. Using cached state."
      return 1
    fi
    git -C "$REPO_DIR" reset --hard "origin/$REPO_BRANCH" 2>&1 | tee -a "${CM_LOG_DIR}/sync.log"
    log_ok "Repository updated."
  fi

  # Validate configs directory exists
  if [ ! -d "$CONFIGS_DIR" ]; then
    log_error "Configs directory not found: $CONFIGS_DIR"
    log_error "Check CONFIGS_SUBDIR in $CM_CONFIG"
    exit 1
  fi

  return 0
}

# ---------------------------------------------------------------------------
# Source component scripts
# ---------------------------------------------------------------------------
CM_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source_component() {
  local component="$1"
  local path="${CM_SCRIPT_DIR}/${component}"
  if [ -f "$path" ]; then
    # shellcheck disable=SC1090
    source "$path"
  else
    log_error "Component not found: $path"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  mkdir -p "$CM_LOG_DIR" "$CM_STATE_DIR" "$CM_BACKUP_DIR" "$CM_CHECKSUM_DIR"

  log_info "============================================"
  log_info "config-manager v${CM_VERSION} — sync starting"
  log_info "============================================"

  acquire_lock
  load_config
  detect_environment

  log_info "OS: ${CONTAINER_OS} ${CONTAINER_OS_VERSION}"
  log_info "User: ${CONTAINER_USER}"
  log_info "First run: ${CONFIG_MANAGER_FIRST_RUN}"

  # --- Source all components ---
  source_component "snapshot-manager.sh"
  source_component "file-manager.sh"
  source_component "script-engine.sh"
  source_component "package-handlers/handler-common.sh"

  # --- Phase 1: Snapshot ---
  log_info "--- Phase: Snapshot ---"
  snapshot_create

  # --- Phase 2: Git sync ---
  log_info "--- Phase: Git Sync ---"
  git_sync || true  # continue with cached state on network failure

  # --- Phase 3: Conflict detection ---
  log_info "--- Phase: Conflict Detection ---"
  if ! conflict_check; then
    log_error "Conflicts detected — aborting sync."
    log_error "Snapshot preserved. Run 'config-rollback status' for details."
    touch "${CM_STATE_DIR}/CONFLICT"
    exit 1
  fi

  # --- Phase 4: Execute scripts ---
  log_info "--- Phase: Script Execution ---"
  scripts_execute

  # --- Phase 5: Deploy files ---
  log_info "--- Phase: File Deployment ---"
  files_deploy

  # --- Phase 6: Install packages ---
  log_info "--- Phase: Package Installation ---"
  packages_install

  # --- Phase 7: Post-sync ---
  log_info "--- Phase: Post-Sync ---"
  checksums_save
  snapshot_cleanup
  date '+%Y-%m-%d %H:%M:%S' > "${CM_STATE_DIR}/last-sync"
  rm -f "${CM_STATE_DIR}/CONFLICT"

  log_ok "============================================"
  log_ok "config-manager sync completed successfully"
  log_ok "============================================"
}

main "$@"

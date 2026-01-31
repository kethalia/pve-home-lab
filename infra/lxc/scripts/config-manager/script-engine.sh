#!/usr/bin/env bash
# =============================================================================
# script-engine.sh — Execute boot scripts in alphabetical order
#
# Runs all .sh scripts from container-configs/scripts/ sequentially.
# Provides helper functions and environment variables to scripts.
#
# Sourced by config-sync.sh
# =============================================================================

[ -n "${_SCRIPT_ENGINE_LOADED:-}" ] && return 0
_SCRIPT_ENGINE_LOADED=1

# ---------------------------------------------------------------------------
# Helper functions available to boot scripts
# ---------------------------------------------------------------------------

# Check if a command exists
is_installed() {
  command -v "$1" >/dev/null 2>&1
}

# Install a package if not already installed (uses detected package manager)
ensure_installed() {
  local pkg="$1"
  if is_installed "$pkg"; then
    return 0
  fi

  log_info "  ensure_installed: installing ${pkg}"
  if is_installed apt-get; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$pkg" >/dev/null 2>&1
  elif is_installed apk; then
    apk add --quiet "$pkg" >/dev/null 2>&1
  elif is_installed dnf; then
    dnf install -y -q "$pkg" >/dev/null 2>&1
  elif is_installed yum; then
    yum install -y -q "$pkg" >/dev/null 2>&1
  else
    log_warn "  No supported package manager found for: ${pkg}"
    return 1
  fi
}

# Export helpers so scripts can use them
export -f is_installed 2>/dev/null || true
export -f ensure_installed 2>/dev/null || true

# ---------------------------------------------------------------------------
# scripts_execute — run all .sh scripts in alphabetical order
# ---------------------------------------------------------------------------
scripts_execute() {
  local scripts_dir="${CONFIGS_DIR:-}/scripts"

  if [ ! -d "$scripts_dir" ]; then
    log_info "No scripts/ directory found. Skipping script execution."
    return 0
  fi

  # Collect .sh files, sorted alphabetically (LC_ALL=C for consistent ordering)
  local scripts=()
  while IFS= read -r -d '' script; do
    scripts+=("$script")
  done < <(find "$scripts_dir" -maxdepth 1 -name '*.sh' -type f -print0 | LC_ALL=C sort -z)

  if [ ${#scripts[@]} -eq 0 ]; then
    log_info "No scripts found in ${scripts_dir}."
    return 0
  fi

  log_info "Found ${#scripts[@]} script(s) to execute."

  local executed=0
  local failed=0

  for script in "${scripts[@]}"; do
    local script_name
    script_name="$(basename "$script")"
    log_info "  Running: ${script_name}"

    # Execute script in a subshell to isolate failures
    # Pass environment variables and helper functions
    local start_time
    start_time="$(date +%s)"

    if (
      export CONFIG_MANAGER_VERSION="${CM_VERSION:-1.0.0}"
      export CONFIG_MANAGER_ROOT="${CONFIGS_DIR:-}"
      export CONFIG_MANAGER_LOG="${CM_LOG_DIR:-/var/log/config-manager}/sync.log"
      export CONFIG_MANAGER_FIRST_RUN="${CONFIG_MANAGER_FIRST_RUN:-false}"
      export CONTAINER_OS="${CONTAINER_OS:-unknown}"
      export CONTAINER_OS_VERSION="${CONTAINER_OS_VERSION:-unknown}"
      export CONTAINER_USER="${CONTAINER_USER:-coder}"

      # Source helpers into subshell
      is_installed()    { command -v "$1" >/dev/null 2>&1; }
      ensure_installed() {
        local pkg="$1"
        if command -v "$pkg" >/dev/null 2>&1; then return 0; fi
        if command -v apt-get >/dev/null 2>&1; then
          DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$pkg" >/dev/null 2>&1
        elif command -v apk >/dev/null 2>&1; then
          apk add --quiet "$pkg" >/dev/null 2>&1
        elif command -v dnf >/dev/null 2>&1; then
          dnf install -y -q "$pkg" >/dev/null 2>&1
        fi
      }
      log_info()  { printf '[%s] [INFO ] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "${CONFIG_MANAGER_LOG}"; }
      log_warn()  { printf '[%s] [WARN ] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "${CONFIG_MANAGER_LOG}"; }
      log_error() { printf '[%s] [ERROR] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "${CONFIG_MANAGER_LOG}"; }
      log_ok()    { printf '[%s] [OK   ] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "${CONFIG_MANAGER_LOG}"; }
      export -f is_installed ensure_installed log_info log_warn log_error log_ok 2>/dev/null || true

      bash "$script"
    ) >> "${CM_LOG_DIR:-/var/log/config-manager}/sync.log" 2>&1; then
      local end_time
      end_time="$(date +%s)"
      local duration=$(( end_time - start_time ))
      log_ok "  Completed: ${script_name} (${duration}s)"
      (( executed++ )) || true
    else
      local exit_code=$?
      log_error "  FAILED: ${script_name} (exit code: ${exit_code})"
      log_error "  Aborting script execution chain."
      (( failed++ )) || true
      log_info "Script execution: ${executed} completed, ${failed} failed."
      return 1
    fi
  done

  log_info "Script execution: ${executed} completed, ${failed} failed."
}

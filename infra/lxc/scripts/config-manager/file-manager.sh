#!/usr/bin/env bash
# =============================================================================
# file-manager.sh — File deployment with policies & conflict detection
#
# Handles:
#   - File deployment with replace/default/backup policies
#   - Checksum tracking for conflict detection
#   - File ownership management
#
# Sourced by config-sync.sh
# =============================================================================

[ -n "${_FILE_MANAGER_LOADED:-}" ] && return 0
_FILE_MANAGER_LOADED=1

readonly _CHECKSUM_PREV="${CM_CHECKSUM_DIR:-/var/lib/config-manager/checksums}/checksums.prev"
readonly _CHECKSUM_CURRENT="${CM_CHECKSUM_DIR:-/var/lib/config-manager/checksums}/checksums.current"
readonly _CONFLICT_LOG="${CM_STATE_DIR:-/var/lib/config-manager}/conflicts.log"

# ---------------------------------------------------------------------------
# Checksum helpers
# ---------------------------------------------------------------------------
_file_checksum() {
  local file="$1"
  if [ -f "$file" ]; then
    sha256sum "$file" 2>/dev/null | cut -d' ' -f1
  else
    echo "MISSING"
  fi
}

# ---------------------------------------------------------------------------
# checksums_save — save current state as "previous" for next sync
# ---------------------------------------------------------------------------
checksums_save() {
  local files_dir="${CONFIGS_DIR:-}/files"
  [ -d "$files_dir" ] || return 0

  : > "$_CHECKSUM_PREV"

  for file in "$files_dir"/*; do
    [ -f "$file" ] || continue
    local basename
    basename="$(basename "$file")"

    # Skip metadata files
    case "$basename" in
      *.path|*.policy) continue ;;
    esac

    local path_file="${file}.path"
    [ -f "$path_file" ] || continue

    local target_dir
    target_dir="$(head -1 "$path_file" | tr -d '[:space:]')"
    local target_path="${target_dir}/${basename}"

    local checksum
    checksum="$(_file_checksum "$target_path")"
    echo "${checksum}  ${target_path}" >> "$_CHECKSUM_PREV"
  done
}

# ---------------------------------------------------------------------------
# conflict_check — detect manual modifications to managed files
# ---------------------------------------------------------------------------
conflict_check() {
  local files_dir="${CONFIGS_DIR:-}/files"
  [ -d "$files_dir" ] || return 0

  # No previous checksums = first run, no conflicts possible
  [ -f "$_CHECKSUM_PREV" ] || return 0

  : > "$_CONFLICT_LOG"
  : > "$_CHECKSUM_CURRENT"
  local has_conflict=0

  for file in "$files_dir"/*; do
    [ -f "$file" ] || continue
    local basename
    basename="$(basename "$file")"

    case "$basename" in
      *.path|*.policy) continue ;;
    esac

    local path_file="${file}.path"
    local policy_file="${file}.policy"
    [ -f "$path_file" ] || continue

    local target_dir
    target_dir="$(head -1 "$path_file" | tr -d '[:space:]')"
    local target_path="${target_dir}/${basename}"

    # Read policy — only "replace" and "backup" files can conflict
    local policy="default"
    [ -f "$policy_file" ] && policy="$(head -1 "$policy_file" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"

    [ "$policy" = "default" ] && continue  # default policy never conflicts

    # Get current target checksum
    local current_checksum
    current_checksum="$(_file_checksum "$target_path")"
    echo "${current_checksum}  ${target_path}" >> "$_CHECKSUM_CURRENT"

    # Get expected checksum (from last sync)
    local expected_checksum
    expected_checksum="$(grep -F "  ${target_path}" "$_CHECKSUM_PREV" 2>/dev/null | cut -d' ' -f1 || echo "")"

    # Get incoming checksum (from git)
    local incoming_checksum
    incoming_checksum="$(_file_checksum "$file")"

    # Conflict: file was modified locally AND changed in git
    if [ -n "$expected_checksum" ] && \
       [ "$current_checksum" != "$expected_checksum" ] && \
       [ "$incoming_checksum" != "$expected_checksum" ] && \
       [ "$current_checksum" != "MISSING" ]; then
      has_conflict=1
      {
        echo "CONFLICT: ${target_path}"
        echo "  Local checksum:    ${current_checksum}"
        echo "  Expected (prev):   ${expected_checksum}"
        echo "  Git incoming:      ${incoming_checksum}"
        echo ""
      } >> "$_CONFLICT_LOG"

      log_error "CONFLICT: ${target_path}"
      log_error "  Local:    ${current_checksum}"
      log_error "  Expected: ${expected_checksum}"
      log_error "  Incoming: ${incoming_checksum}"
    fi
  done

  if [ "$has_conflict" -eq 1 ]; then
    log_error ""
    log_error "Conflicts detected in managed files."
    log_error "Manual changes conflict with incoming git updates."
    log_error "Details: ${_CONFLICT_LOG}"
    if [ -n "${_current_snapshot:-}" ]; then
      log_error "Snapshot preserved: ${_current_snapshot}"
      log_error "To rollback: config-rollback restore ${_current_snapshot}"
    fi
    log_error "To resolve: Fix conflicting files, then run: config-rollback resolve"
    return 1
  fi

  return 0
}

# ---------------------------------------------------------------------------
# files_deploy — deploy all managed files according to their policies
# ---------------------------------------------------------------------------
files_deploy() {
  local files_dir="${CONFIGS_DIR:-}/files"
  if [ ! -d "$files_dir" ]; then
    log_info "No files/ directory found. Skipping file deployment."
    return 0
  fi

  local deployed=0
  local skipped=0
  local failed=0

  for file in "$files_dir"/*; do
    [ -f "$file" ] || continue
    local basename
    basename="$(basename "$file")"

    # Skip metadata files
    case "$basename" in
      *.path|*.policy) continue ;;
    esac

    # Read target path
    local path_file="${file}.path"
    if [ ! -f "$path_file" ]; then
      log_warn "Missing .path file for: ${basename} — skipping."
      (( failed++ )) || true
      continue
    fi

    local target_dir
    target_dir="$(head -1 "$path_file" | tr -d '[:space:]')"
    if [ -z "$target_dir" ]; then
      log_warn "Empty .path file for: ${basename} — skipping."
      (( failed++ )) || true
      continue
    fi

    local target_path="${target_dir}/${basename}"

    # Read policy (default: "default")
    local policy="default"
    local policy_file="${file}.policy"
    if [ -f "$policy_file" ]; then
      policy="$(head -1 "$policy_file" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
    fi

    # Validate policy
    case "$policy" in
      replace|default|backup) ;;
      *)
        log_warn "Unknown policy '${policy}' for ${basename}. Using 'default'."
        policy="default"
        ;;
    esac

    # Check if files differ
    local source_checksum target_checksum
    source_checksum="$(_file_checksum "$file")"
    target_checksum="$(_file_checksum "$target_path")"

    # Apply policy
    case "$policy" in
      default)
        if [ -f "$target_path" ]; then
          log_info "  [default] ${basename} → exists at ${target_path}, skipping."
          (( skipped++ )) || true
          continue
        fi
        ;;
      replace)
        if [ "$source_checksum" = "$target_checksum" ]; then
          log_info "  [replace] ${basename} → already up-to-date."
          (( skipped++ )) || true
          continue
        fi
        ;;
      backup)
        if [ "$source_checksum" = "$target_checksum" ]; then
          log_info "  [backup]  ${basename} → already up-to-date."
          (( skipped++ )) || true
          continue
        fi
        if [ -f "$target_path" ]; then
          local backup_name="${target_path}.backup-$(date '+%Y%m%d-%H%M%S')"
          cp -a "$target_path" "$backup_name"
          log_info "  [backup]  Backed up: ${target_path} → ${backup_name}"
        fi
        ;;
    esac

    # Create target directory if needed
    if [ ! -d "$target_dir" ]; then
      mkdir -p "$target_dir"
      log_info "  Created directory: ${target_dir}"
    fi

    # Create file-level backup if no snapshot backend
    if [ -f "$target_path" ]; then
      file_backup_create "$target_path" 2>/dev/null || true
    fi

    # Deploy file
    if cp -f "$file" "$target_path" 2>/dev/null; then
      # Set ownership to match the container user
      local user="${CONTAINER_USER:-coder}"
      if id "$user" >/dev/null 2>&1; then
        # If target is under user's home, set ownership
        local user_home
        user_home="$(eval echo "~${user}" 2>/dev/null || echo "/home/${user}")"
        if [[ "$target_path" == "${user_home}"* ]]; then
          chown "${user}:${user}" "$target_path" 2>/dev/null || true
        fi
      fi

      log_ok "  [${policy}] Deployed: ${basename} → ${target_path}"
      (( deployed++ )) || true
    else
      log_error "  Failed to deploy: ${basename} → ${target_path}"
      (( failed++ )) || true
    fi
  done

  log_info "File deployment: ${deployed} deployed, ${skipped} skipped, ${failed} failed."
}

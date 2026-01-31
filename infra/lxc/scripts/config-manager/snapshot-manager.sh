#!/usr/bin/env bash
# =============================================================================
# snapshot-manager.sh — Filesystem snapshot & rollback for config-manager
#
# Supports: ZFS, LVM, BTRFS, and file-level fallback.
# Sourced by config-sync.sh; also usable standalone.
#
# Standalone usage:
#   snapshot-manager.sh create
#   snapshot-manager.sh list
#   snapshot-manager.sh cleanup
#   snapshot-manager.sh rollback <snapshot-name>
# =============================================================================

# Guard: only define functions once
[ -n "${_SNAPSHOT_MANAGER_LOADED:-}" ] && return 0
_SNAPSHOT_MANAGER_LOADED=1

# ---------------------------------------------------------------------------
# Detect snapshot backend
# ---------------------------------------------------------------------------
_snapshot_backend=""
_snapshot_dataset=""
_current_snapshot=""

snapshot_detect_backend() {
  # Honour explicit config
  case "${SNAPSHOT_BACKEND:-auto}" in
    zfs|lvm|btrfs|none) _snapshot_backend="$SNAPSHOT_BACKEND"; return 0 ;;
  esac

  # Auto-detect
  if command -v zfs >/dev/null 2>&1; then
    local root_ds
    root_ds="$(findmnt -n -o SOURCE / 2>/dev/null || true)"
    if [ -n "$root_ds" ] && zfs list "$root_ds" >/dev/null 2>&1; then
      _snapshot_backend="zfs"
      _snapshot_dataset="$root_ds"
      return 0
    fi
  fi

  if command -v lvcreate >/dev/null 2>&1; then
    local root_lv
    root_lv="$(findmnt -n -o SOURCE / 2>/dev/null || true)"
    if [ -n "$root_lv" ] && lvs "$root_lv" >/dev/null 2>&1; then
      _snapshot_backend="lvm"
      _snapshot_dataset="$root_lv"
      return 0
    fi
  fi

  if command -v btrfs >/dev/null 2>&1; then
    if btrfs subvolume show / >/dev/null 2>&1; then
      _snapshot_backend="btrfs"
      return 0
    fi
  fi

  _snapshot_backend="none"
}

# ---------------------------------------------------------------------------
# Create snapshot
# ---------------------------------------------------------------------------
snapshot_create() {
  if [ "${SNAPSHOT_ENABLED:-auto}" = "no" ]; then
    log_info "Snapshots disabled by configuration."
    return 0
  fi

  snapshot_detect_backend

  local ts
  ts="$(date '+%Y%m%d-%H%M%S')"
  _current_snapshot="config-manager-${ts}"

  case "$_snapshot_backend" in
    zfs)
      log_info "Creating ZFS snapshot: ${_snapshot_dataset}@${_current_snapshot}"
      if zfs snapshot "${_snapshot_dataset}@${_current_snapshot}" 2>&1; then
        log_ok "ZFS snapshot created."
      else
        log_warn "ZFS snapshot failed — continuing without snapshot."
        _current_snapshot=""
      fi
      ;;
    lvm)
      log_info "Creating LVM snapshot: ${_current_snapshot}"
      local vg lv
      vg="$(lvs --noheadings -o vg_name "$_snapshot_dataset" 2>/dev/null | tr -d ' ')"
      lv="$(lvs --noheadings -o lv_name "$_snapshot_dataset" 2>/dev/null | tr -d ' ')"
      if lvcreate --snapshot --name "${_current_snapshot}" --size 1G "${vg}/${lv}" 2>&1; then
        log_ok "LVM snapshot created."
      else
        log_warn "LVM snapshot failed — continuing without snapshot."
        _current_snapshot=""
      fi
      ;;
    btrfs)
      local snap_dir="/var/lib/config-manager/snapshots"
      mkdir -p "$snap_dir"
      log_info "Creating BTRFS snapshot: ${snap_dir}/${_current_snapshot}"
      if btrfs subvolume snapshot / "${snap_dir}/${_current_snapshot}" 2>&1; then
        log_ok "BTRFS snapshot created."
      else
        log_warn "BTRFS snapshot failed — continuing without snapshot."
        _current_snapshot=""
      fi
      ;;
    none)
      log_info "No filesystem snapshot backend available. Using file-level backups."
      _current_snapshot=""
      ;;
  esac
}

# ---------------------------------------------------------------------------
# List snapshots
# ---------------------------------------------------------------------------
snapshot_list() {
  snapshot_detect_backend

  case "$_snapshot_backend" in
    zfs)
      zfs list -t snapshot -o name,creation -s creation 2>/dev/null \
        | grep "config-manager-" || echo "(none)"
      ;;
    lvm)
      lvs --noheadings -o lv_name,lv_time 2>/dev/null \
        | grep "config-manager-" || echo "(none)"
      ;;
    btrfs)
      local snap_dir="/var/lib/config-manager/snapshots"
      if [ -d "$snap_dir" ]; then
        ls -1 "$snap_dir" 2>/dev/null | grep "config-manager-" || echo "(none)"
      else
        echo "(none)"
      fi
      ;;
    none)
      local backup_dir="/var/lib/config-manager/backups"
      if [ -d "$backup_dir" ]; then
        ls -1 "$backup_dir" 2>/dev/null | grep "config-manager-" || echo "(none)"
      else
        echo "(none)"
      fi
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Rollback to snapshot
# ---------------------------------------------------------------------------
snapshot_rollback() {
  local target="${1:-}"
  if [ -z "$target" ]; then
    log_error "Usage: snapshot_rollback <snapshot-name>"
    return 1
  fi

  snapshot_detect_backend

  case "$_snapshot_backend" in
    zfs)
      log_info "Rolling back ZFS to: ${_snapshot_dataset}@${target}"
      zfs rollback "${_snapshot_dataset}@${target}"
      log_ok "ZFS rollback complete. Reboot recommended."
      ;;
    lvm)
      log_info "Rolling back LVM snapshot: ${target}"
      local snap_vg
      snap_vg="$(lvs --noheadings -o vg_name -S "lv_name=${target}" 2>/dev/null | tr -d ' ')"
      if [ -z "$snap_vg" ]; then
        log_error "LVM snapshot not found: ${target}"
        return 1
      fi
      lvconvert --merge "/dev/${snap_vg}/${target}" 2>&1
      log_ok "LVM rollback scheduled. Reboot required."
      ;;
    btrfs)
      local snap_dir="/var/lib/config-manager/snapshots"
      if [ -d "${snap_dir}/${target}" ]; then
        log_info "BTRFS rollback: restoring from ${snap_dir}/${target}"
        log_warn "BTRFS rollback requires manual subvolume swap. Snapshot path: ${snap_dir}/${target}"
      else
        log_error "BTRFS snapshot not found: ${target}"
        return 1
      fi
      ;;
    none)
      local backup_path="${CM_BACKUP_DIR:-/var/lib/config-manager/backups}/${target}"
      if [ -d "$backup_path" ]; then
        log_info "Restoring file-level backup: ${target}"
        while IFS= read -r backup_file; do
          local rel_path="${backup_file#${backup_path}}"
          if [ -f "$backup_file" ]; then
            cp -f "$backup_file" "$rel_path" 2>/dev/null && \
              log_info "  Restored: $rel_path" || \
              log_warn "  Failed to restore: $rel_path"
          fi
        done < <(find "$backup_path" -type f 2>/dev/null)
        log_ok "File-level rollback complete."
      else
        log_error "Backup not found: ${target}"
        return 1
      fi
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Cleanup old snapshots
# ---------------------------------------------------------------------------
snapshot_cleanup() {
  local retention_days="${SNAPSHOT_RETENTION_DAYS:-7}"

  snapshot_detect_backend

  case "$_snapshot_backend" in
    zfs)
      local cutoff
      cutoff="$(date -d "-${retention_days} days" '+%Y%m%d-%H%M%S' 2>/dev/null || date -v-${retention_days}d '+%Y%m%d-%H%M%S' 2>/dev/null || true)"
      [ -z "$cutoff" ] && return 0
      zfs list -t snapshot -o name -H 2>/dev/null | grep "config-manager-" | while read -r snap; do
        local snap_ts="${snap##*config-manager-}"
        if [[ "$snap_ts" < "$cutoff" ]]; then
          log_info "Removing old ZFS snapshot: $snap"
          zfs destroy "$snap" 2>/dev/null || true
        fi
      done
      ;;
    lvm)
      # LVM snapshots are harder to age-out; keep last N instead
      local count
      count="$(lvs --noheadings -o lv_name 2>/dev/null | grep -c "config-manager-" || echo 0)"
      local max_keep=$(( retention_days ))
      if [ "$count" -gt "$max_keep" ]; then
        local to_remove=$(( count - max_keep ))
        lvs --noheadings -o lv_name,vg_name 2>/dev/null | grep "config-manager-" | head -n "$to_remove" | while read -r lv vg; do
          lv="$(echo "$lv" | tr -d ' ')"
          vg="$(echo "$vg" | tr -d ' ')"
          log_info "Removing old LVM snapshot: $lv"
          lvremove -f "/dev/${vg}/${lv}" 2>/dev/null || true
        done
      fi
      ;;
    btrfs)
      local snap_dir="/var/lib/config-manager/snapshots"
      [ -d "$snap_dir" ] || return 0
      find "$snap_dir" -maxdepth 1 -name "config-manager-*" -type d -mtime "+${retention_days}" -exec sh -c '
        btrfs subvolume delete "$1" 2>/dev/null || rm -rf "$1"
      ' _ {} \;
      ;;
    none)
      local backup_dir="${CM_BACKUP_DIR:-/var/lib/config-manager/backups}"
      [ -d "$backup_dir" ] || return 0
      find "$backup_dir" -maxdepth 1 -name "config-manager-*" -type d -mtime "+${retention_days}" -exec rm -rf {} \;
      ;;
  esac

  log_info "Snapshot cleanup complete (retention: ${retention_days} days)."
}

# ---------------------------------------------------------------------------
# File-level backup (fallback when no snapshot backend)
# ---------------------------------------------------------------------------
_file_backup_session_ts=""

file_backup_create() {
  local file_path="$1"
  if [ -z "$_current_snapshot" ] && [ "${_snapshot_backend}" = "none" ]; then
    # Use a single timestamp per sync session so all backups land in one dir
    if [ -z "$_file_backup_session_ts" ]; then
      _file_backup_session_ts="$(date '+%Y%m%d-%H%M%S')"
    fi
    local backup_base="${CM_BACKUP_DIR:-/var/lib/config-manager/backups}/config-manager-${_file_backup_session_ts}"
    local backup_path="${backup_base}${file_path}"
    mkdir -p "$(dirname "$backup_path")"
    cp -a "$file_path" "$backup_path" 2>/dev/null || true
  fi
}

# ---------------------------------------------------------------------------
# Standalone CLI
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  # Sourced outside config-sync — define minimal logging
  if ! type log_info &>/dev/null 2>&1; then
    log_info()  { printf '[INFO]  %s\n' "$*"; }
    log_ok()    { printf '[ OK ]  %s\n' "$*"; }
    log_warn()  { printf '[WARN]  %s\n' "$*"; }
    log_error() { printf '[FAIL]  %s\n' "$*" >&2; }
  fi

  # Load config for retention settings
  if [ -f "/etc/config-manager/config.env" ]; then
    while IFS='=' read -r k v; do
      k="$(echo "$k" | tr -d '[:space:]')"
      v="$(echo "$v" | sed 's/^["'\'']//' | sed 's/["'\'']$//' | sed 's/#.*//' | sed 's/[[:space:]]*$//')"
      [[ -z "$k" || "$k" == \#* ]] && continue
      case "$k" in
        SNAPSHOT_BACKEND)         SNAPSHOT_BACKEND="$v" ;;
        SNAPSHOT_RETENTION_DAYS)  SNAPSHOT_RETENTION_DAYS="$v" ;;
      esac
    done < "/etc/config-manager/config.env"
  fi

  case "${1:-}" in
    create)   snapshot_create  ;;
    list)     snapshot_list    ;;
    cleanup)  snapshot_cleanup ;;
    rollback) snapshot_rollback "${2:-}" ;;
    *)
      echo "Usage: $(basename "$0") {create|list|cleanup|rollback <name>}"
      exit 1
      ;;
  esac
fi

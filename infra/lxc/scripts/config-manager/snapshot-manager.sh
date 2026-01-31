#!/usr/bin/env bash
# snapshot-manager.sh — Filesystem snapshot system for config-manager.
#
# Creates pre-sync snapshots before configuration changes and provides
# rollback capabilities. Supports ZFS, LVM, BTRFS, and a file-level
# backup fallback.
#
# Usage:
#   snapshot-manager.sh <command> [args]
#
# Commands:
#   create              Create a new pre-sync snapshot
#   list                List available snapshots
#   cleanup             Remove snapshots older than retention period
#   rollback <name>     Restore system to the given snapshot
#   status              Show detected backend and current state
#
# Configuration (via /etc/config-manager/config.env):
#   SNAPSHOT_ENABLED=auto          # auto|yes|no
#   SNAPSHOT_RETENTION_DAYS=7      # days to keep snapshots
#   SNAPSHOT_BACKEND=auto          # auto|zfs|lvm|btrfs|none
#
# Exit codes:
#   0  — success
#   1  — general error
#   2  — snapshots disabled
#   3  — backend operation failed
#   4  — invalid arguments

set -euo pipefail

# Guard against double-sourcing (similar to config-manager-helpers.sh)
[[ -n "${_SNAPSHOT_MANAGER_LOADED:-}" ]] && return 0
readonly _SNAPSHOT_MANAGER_LOADED=1

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly SNAPSHOT_PREFIX="config-manager"
readonly STATE_DIR="/var/lib/config-manager"
readonly BACKUP_DIR="${STATE_DIR}/backups"
readonly SNAPSHOT_STATE_FILE="${STATE_DIR}/snapshot-state"

# Don't redeclare CONFIG_FILE if already set (when sourced from config-sync.sh)
if [[ -z "${CONFIG_FILE:-}" ]]; then
    readonly CONFIG_FILE="/etc/config-manager/config.env"
fi

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
# Configuration
# ---------------------------------------------------------------------------
load_snapshot_config() {
    # Defaults
    SNAPSHOT_ENABLED="${SNAPSHOT_ENABLED:-auto}"
    SNAPSHOT_RETENTION_DAYS="${SNAPSHOT_RETENTION_DAYS:-7}"
    SNAPSHOT_BACKEND="${SNAPSHOT_BACKEND:-auto}"

    # Load from config file if present and values not already in environment
    if [[ -f "$CONFIG_FILE" ]]; then
        # Only source variables we care about — avoid clobbering existing env
        local _enabled _retention _backend
        _enabled="$(grep -E '^SNAPSHOT_ENABLED=' "$CONFIG_FILE" 2>/dev/null | tail -1 | cut -d= -f2-)" || true
        _retention="$(grep -E '^SNAPSHOT_RETENTION_DAYS=' "$CONFIG_FILE" 2>/dev/null | tail -1 | cut -d= -f2-)" || true
        _backend="$(grep -E '^SNAPSHOT_BACKEND=' "$CONFIG_FILE" 2>/dev/null | tail -1 | cut -d= -f2-)" || true

        [[ -n "$_enabled" ]]   && SNAPSHOT_ENABLED="$_enabled"
        [[ -n "$_retention" ]] && SNAPSHOT_RETENTION_DAYS="$_retention"
        [[ -n "$_backend" ]]   && SNAPSHOT_BACKEND="$_backend"
    fi

    # Validate
    case "$SNAPSHOT_ENABLED" in
        auto|yes|no) ;;
        *) log_error "Invalid SNAPSHOT_ENABLED value: '$SNAPSHOT_ENABLED' (expected: auto|yes|no)"
           return 1 ;;
    esac

    case "$SNAPSHOT_BACKEND" in
        auto|zfs|lvm|btrfs|none) ;;
        *) log_error "Invalid SNAPSHOT_BACKEND value: '$SNAPSHOT_BACKEND' (expected: auto|zfs|lvm|btrfs|none)"
           return 1 ;;
    esac

    if ! [[ "$SNAPSHOT_RETENTION_DAYS" =~ ^[0-9]+$ ]] || [[ "$SNAPSHOT_RETENTION_DAYS" -lt 1 ]]; then
        log_error "Invalid SNAPSHOT_RETENTION_DAYS: '$SNAPSHOT_RETENTION_DAYS' (expected positive integer)"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Timestamp helper
# ---------------------------------------------------------------------------
snapshot_timestamp() {
    date '+%Y%m%d-%H%M%S'
}

snapshot_name() {
    echo "${SNAPSHOT_PREFIX}-$(snapshot_timestamp)"
}

# ---------------------------------------------------------------------------
# Backend detection
# ---------------------------------------------------------------------------

# Detect the ZFS dataset for the root filesystem.
# Prints the dataset name on success, returns 1 on failure.
detect_zfs() {
    command -v zfs &>/dev/null || return 1
    # Check if root is on ZFS
    local dataset
    dataset="$(findmnt -n -o SOURCE / 2>/dev/null)" || return 1
    if zfs list "$dataset" &>/dev/null; then
        echo "$dataset"
        return 0
    fi
    # Try to find any ZFS pool
    if zfs list -H -o name 2>/dev/null | head -1 | grep -q .; then
        local root_ds
        root_ds="$(zfs list -H -o name,mountpoint 2>/dev/null | awk '$2 == "/" {print $1; exit}')"
        if [[ -n "$root_ds" ]]; then
            echo "$root_ds"
            return 0
        fi
    fi
    return 1
}

# Detect the LVM logical volume for the root filesystem.
# Prints "vg_name/lv_name" on success, returns 1 on failure.
detect_lvm() {
    command -v lvs &>/dev/null || return 1
    local root_dev
    root_dev="$(findmnt -n -o SOURCE / 2>/dev/null)" || return 1

    # Resolve to device-mapper path if needed
    if [[ -L "$root_dev" ]]; then
        root_dev="$(readlink -f "$root_dev")"
    fi

    # Check if root is on an LV
    local lv_info
    lv_info="$(lvs --noheadings -o vg_name,lv_name --separator '/' "$root_dev" 2>/dev/null)" || return 1
    lv_info="$(echo "$lv_info" | tr -d ' ')"
    if [[ -n "$lv_info" ]]; then
        echo "$lv_info"
        return 0
    fi
    return 1
}

# Detect if root is on a BTRFS filesystem.
# Returns 0 on success, 1 on failure.
detect_btrfs() {
    command -v btrfs &>/dev/null || return 1
    local fstype
    fstype="$(findmnt -n -o FSTYPE / 2>/dev/null)" || return 1
    [[ "$fstype" == "btrfs" ]]
}

# Auto-detect the best available snapshot backend.
# Sets DETECTED_BACKEND and backend-specific state variables.
detect_backend() {
    # Check for findmnt early (required by all backend detectors)
    if ! command -v findmnt &>/dev/null; then
        log_warn "findmnt command not found (util-linux package) — cannot detect ZFS/LVM/BTRFS."
        log_warn "Falling back to file-level backups. Install util-linux for filesystem snapshot support."
        DETECTED_BACKEND="none"
        return 0
    fi

    if [[ "$SNAPSHOT_BACKEND" != "auto" ]]; then
        DETECTED_BACKEND="$SNAPSHOT_BACKEND"
        case "$DETECTED_BACKEND" in
            zfs)
                ZFS_DATASET="$(detect_zfs)" || {
                    log_error "ZFS backend requested but root is not on ZFS."
                    return 3
                }
                ;;
            lvm)
                LVM_LV="$(detect_lvm)" || {
                    log_error "LVM backend requested but root is not on LVM."
                    return 3
                }
                ;;
            btrfs)
                detect_btrfs || {
                    log_error "BTRFS backend requested but root is not on BTRFS."
                    return 3
                }
                ;;
            none)
                DETECTED_BACKEND="none"
                ;;
        esac
        return 0
    fi

    # Auto-detect priority: ZFS > LVM > BTRFS > none
    if ZFS_DATASET="$(detect_zfs)" 2>/dev/null; then
        DETECTED_BACKEND="zfs"
        log_info "Auto-detected snapshot backend: ZFS (dataset: $ZFS_DATASET)"
        return 0
    fi

    if LVM_LV="$(detect_lvm)" 2>/dev/null; then
        DETECTED_BACKEND="lvm"
        log_info "Auto-detected snapshot backend: LVM (lv: $LVM_LV)"
        return 0
    fi

    if detect_btrfs 2>/dev/null; then
        DETECTED_BACKEND="btrfs"
        log_info "Auto-detected snapshot backend: BTRFS"
        return 0
    fi

    DETECTED_BACKEND="none"
    log_info "No filesystem snapshot support detected — using file-level backups."
    return 0
}

# ---------------------------------------------------------------------------
# Check if snapshots are enabled
# ---------------------------------------------------------------------------
check_enabled() {
    case "$SNAPSHOT_ENABLED" in
        no)
            log_info "Snapshots are disabled (SNAPSHOT_ENABLED=no)."
            return 2
            ;;
        yes|auto)
            # Both 'yes' and 'auto' enable snapshots
            # With 'auto' and no backend, file-level fallback is used
            return 0
            ;;
    esac
}

# ---------------------------------------------------------------------------
# ZFS backend operations
# ---------------------------------------------------------------------------
zfs_create() {
    local name="$1"
    local snap="${ZFS_DATASET}@${name}"
    log_info "Creating ZFS snapshot: $snap"
    if zfs snapshot "$snap" &>/dev/null; then
        log_info "ZFS snapshot created: $snap"
        return 0
    else
        log_error "Failed to create ZFS snapshot: $snap"
        return 3
    fi
}

zfs_list() {
    log_info "Available ZFS snapshots:"
    zfs list -t snapshot -o name,creation -s creation 2>/dev/null \
        | grep "@${SNAPSHOT_PREFIX}-" \
        || log_info "  (none)"
}

zfs_cleanup() {
    local retention_secs=$(( SNAPSHOT_RETENTION_DAYS * 86400 ))
    local now
    now="$(date +%s)"
    local removed=0

    while IFS=$'\t' read -r snap_name creation_epoch; do
        [[ -z "$snap_name" ]] && continue
        local age=$(( now - creation_epoch ))
        if [[ $age -gt $retention_secs ]]; then
            log_info "Removing old ZFS snapshot: $snap_name (age: $(( age / 86400 )) days)"
            if zfs destroy "$snap_name" &>/dev/null; then
                (( removed++ )) || true
            else
                log_warn "Failed to remove ZFS snapshot: $snap_name"
            fi
        fi
    done < <(zfs list -t snapshot -Hp -o name,creation -s creation 2>/dev/null \
                | grep "@${SNAPSHOT_PREFIX}-")

    log_info "ZFS cleanup complete — removed $removed snapshot(s)."
}

zfs_rollback() {
    local name="$1"
    local snap="${ZFS_DATASET}@${name}"

    if ! zfs list -t snapshot "$snap" &>/dev/null; then
        log_error "ZFS snapshot not found: $snap"
        return 3
    fi

    log_warn "Rolling back ZFS to snapshot: $snap"
    log_warn "This will discard all changes made after the snapshot."
    if zfs rollback -r "$snap" &>/dev/null; then
        log_info "ZFS rollback complete: $snap"
        return 0
    else
        log_error "ZFS rollback failed: $snap"
        return 3
    fi
}

# ---------------------------------------------------------------------------
# LVM backend operations
# ---------------------------------------------------------------------------
lvm_lv_path() {
    local vg lv
    vg="$(echo "$LVM_LV" | cut -d/ -f1)"
    lv="$(echo "$LVM_LV" | cut -d/ -f2)"
    echo "/dev/${vg}/${lv}"
}

lvm_create() {
    local name="$1"
    local lv_path
    lv_path="$(lvm_lv_path)"

    # Default snapshot size: 1G (should be enough for config changes)
    local snap_size="${LVM_SNAPSHOT_SIZE:-1G}"

    log_info "Creating LVM snapshot: $name (source: $lv_path, size: $snap_size)"
    if lvcreate --snapshot --size "$snap_size" --name "$name" "$lv_path" &>/dev/null; then
        log_info "LVM snapshot created: $name"
        return 0
    else
        log_error "Failed to create LVM snapshot: $name"
        return 3
    fi
}

lvm_list() {
    local vg
    vg="$(echo "$LVM_LV" | cut -d/ -f1)"
    log_info "Available LVM snapshots:"
    lvs --noheadings -o lv_name,lv_size,lv_time "$vg" 2>/dev/null \
        | grep "$SNAPSHOT_PREFIX" \
        || log_info "  (none)"
}

lvm_cleanup() {
    local vg
    vg="$(echo "$LVM_LV" | cut -d/ -f1)"
    local retention_secs=$(( SNAPSHOT_RETENTION_DAYS * 86400 ))
    local now
    now="$(date +%s)"
    local removed=0

    while IFS= read -r line; do
        local lv_name lv_time_str lv_time_epoch
        lv_name="$(echo "$line" | awk '{print $1}')"
        [[ -z "$lv_name" ]] && continue
        [[ "$lv_name" != ${SNAPSHOT_PREFIX}* ]] && continue

        # Get creation time from LV attributes (trim whitespace but preserve internal spaces)
        lv_time_str="$(lvs --noheadings -o lv_time "/dev/${vg}/${lv_name}" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        if [[ -n "$lv_time_str" ]]; then
            lv_time_epoch="$(date -d "$lv_time_str" +%s 2>/dev/null || echo 0)"
            local age=$(( now - lv_time_epoch ))
            if [[ $age -gt $retention_secs ]]; then
                log_info "Removing old LVM snapshot: $lv_name (age: $(( age / 86400 )) days)"
                if lvremove -f "/dev/${vg}/${lv_name}" &>/dev/null; then
                    (( removed++ )) || true
                else
                    log_warn "Failed to remove LVM snapshot: $lv_name"
                fi
            fi
        fi
    done < <(lvs --noheadings -o lv_name "$vg" 2>/dev/null)

    log_info "LVM cleanup complete — removed $removed snapshot(s)."
}

lvm_rollback() {
    local name="$1"
    local vg
    vg="$(echo "$LVM_LV" | cut -d/ -f1)"
    local snap_path="/dev/${vg}/${name}"

    if ! lvs "$snap_path" &>/dev/null; then
        log_error "LVM snapshot not found: $snap_path"
        return 3
    fi

    log_warn "Merging LVM snapshot: $snap_path"
    log_warn "The merge will complete on next reboot/activation."
    if lvconvert --merge "$snap_path" &>/dev/null; then
        log_info "LVM merge scheduled: $snap_path (will complete on next LV activation)"
        return 0
    else
        log_error "LVM merge failed: $snap_path"
        return 3
    fi
}

# ---------------------------------------------------------------------------
# BTRFS backend operations
# ---------------------------------------------------------------------------
readonly BTRFS_SNAP_DIR="/.snapshots"

btrfs_create() {
    local name="$1"
    local snap_path="${BTRFS_SNAP_DIR}/${name}"

    mkdir -p "$BTRFS_SNAP_DIR"

    log_info "Creating BTRFS snapshot: $snap_path"
    if btrfs subvolume snapshot -r / "$snap_path" &>/dev/null; then
        log_info "BTRFS snapshot created: $snap_path"
        return 0
    else
        log_error "Failed to create BTRFS snapshot: $snap_path"
        return 3
    fi
}

btrfs_list() {
    log_info "Available BTRFS snapshots:"
    if [[ -d "$BTRFS_SNAP_DIR" ]]; then
        local found=0
        for snap in "${BTRFS_SNAP_DIR}/${SNAPSHOT_PREFIX}"-*; do
            [[ -d "$snap" ]] || continue
            local snap_name
            snap_name="$(basename "$snap")"
            local snap_info
            snap_info="$(btrfs subvolume show "$snap" 2>/dev/null | grep -E 'Creation time' | sed 's/.*Creation time:[[:space:]]*//')" || true
            printf '  %s  (created: %s)\n' "$snap_name" "${snap_info:-unknown}"
            (( found++ )) || true
        done
        [[ $found -eq 0 ]] && log_info "  (none)"
    else
        log_info "  (none)"
    fi
}

btrfs_cleanup() {
    local retention_secs=$(( SNAPSHOT_RETENTION_DAYS * 86400 ))
    local now
    now="$(date +%s)"
    local removed=0

    [[ -d "$BTRFS_SNAP_DIR" ]] || return 0

    for snap in "${BTRFS_SNAP_DIR}/${SNAPSHOT_PREFIX}"-*; do
        [[ -d "$snap" ]] || continue

        # Extract timestamp from name: config-manager-YYYYMMDD-HHMMSS
        local snap_name
        snap_name="$(basename "$snap")"
        local ts_part
        ts_part="${snap_name#${SNAPSHOT_PREFIX}-}"

        # Parse YYYYMMDD-HHMMSS into epoch
        local snap_epoch
        snap_epoch="$(date -d "${ts_part:0:4}-${ts_part:4:2}-${ts_part:6:2} ${ts_part:9:2}:${ts_part:11:2}:${ts_part:13:2}" +%s 2>/dev/null || echo 0)"

        local age=$(( now - snap_epoch ))
        if [[ $age -gt $retention_secs ]]; then
            log_info "Removing old BTRFS snapshot: $snap_name (age: $(( age / 86400 )) days)"
            if btrfs subvolume delete "$snap" &>/dev/null; then
                (( removed++ )) || true
            else
                log_warn "Failed to remove BTRFS snapshot: $snap_name"
            fi
        fi
    done

    log_info "BTRFS cleanup complete — removed $removed snapshot(s)."
}

btrfs_rollback() {
    local name="$1"
    local snap_path="${BTRFS_SNAP_DIR}/${name}"

    if [[ ! -d "$snap_path" ]]; then
        log_error "BTRFS snapshot not found: $snap_path"
        return 3
    fi

    log_warn "============================================================"
    log_warn "BTRFS ROLLBACK REQUIRES MANUAL STEPS (unlike ZFS/LVM)"
    log_warn "This will create a restore snapshot but NOT automatically activate it."
    log_warn "============================================================"

    local restore_path="${BTRFS_SNAP_DIR}/${name}-restore"
    if btrfs subvolume snapshot "$snap_path" "$restore_path" &>/dev/null; then
        log_info "BTRFS writable restore snapshot created at: $restore_path"
        log_warn "Manual steps required to complete BTRFS rollback:"
        log_warn "  1. Boot into a recovery environment (live USB/CD)"
        log_warn "  2. Mount the BTRFS filesystem"
        log_warn "  3. Move current root subvolume aside"
        log_warn "  4. Move restore snapshot to root subvolume location"
        log_warn "  5. Reboot and verify system state"
        log_warn "For assistance: https://btrfs.readthedocs.io/en/latest/Subvolumes.html"
        return 0
    else
        log_error "BTRFS rollback failed: could not create restore snapshot"
        return 3
    fi
}

# ---------------------------------------------------------------------------
# File-level backup fallback
# ---------------------------------------------------------------------------
fallback_create() {
    local name="$1"
    local backup_path="${BACKUP_DIR}/${name}"

    mkdir -p "$backup_path"

    log_info "Creating file-level backup: $backup_path"

    # Back up key managed paths — we record what was backed up in a manifest
    local manifest="${backup_path}/MANIFEST"
    local file_count=0

    # Back up the state directory itself (checksums, etc.)
    if [[ -d "${STATE_DIR}/state" ]]; then
        cp -a "${STATE_DIR}/state" "${backup_path}/state" 2>/dev/null || true
        echo "state/" >> "$manifest"
        (( file_count++ )) || true
    fi

    # If process-files.sh left a record of managed files, back them up
    local managed_files_list="${STATE_DIR}/state/managed-files.list"
    if [[ -f "$managed_files_list" ]]; then
        while IFS= read -r target_file; do
            [[ -z "$target_file" ]] && continue
            [[ -f "$target_file" ]] || continue

            # Preserve directory structure inside backup
            local relative_path="${target_file#/}"
            local backup_file_dir="${backup_path}/files/$(dirname "$relative_path")"
            mkdir -p "$backup_file_dir"
            cp -a "$target_file" "${backup_path}/files/${relative_path}" 2>/dev/null || {
                log_warn "Failed to back up: $target_file"
                continue
            }
            echo "files/${relative_path}" >> "$manifest"
            (( file_count++ )) || true
        done < "$managed_files_list"
    fi

    # Write metadata
    cat > "${backup_path}/METADATA" <<EOF
snapshot_name=${name}
created=$(date '+%Y-%m-%d %H:%M:%S')
created_epoch=$(date +%s)
backend=file-backup
file_count=${file_count}
EOF

    log_info "File-level backup created: $backup_path ($file_count file(s) backed up)"
    return 0
}

fallback_list() {
    log_info "Available file-level backups:"

    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_info "  (none)"
        return 0
    fi

    local found=0
    for backup in "${BACKUP_DIR}/${SNAPSHOT_PREFIX}"-*; do
        [[ -d "$backup" ]] || continue
        local backup_name
        backup_name="$(basename "$backup")"
        local created="unknown"
        if [[ -f "${backup}/METADATA" ]]; then
            created="$(grep '^created=' "${backup}/METADATA" | cut -d= -f2-)" || true
        fi
        printf '  %s  (created: %s)\n' "$backup_name" "$created"
        (( found++ )) || true
    done

    [[ $found -eq 0 ]] && log_info "  (none)"
}

fallback_cleanup() {
    local retention_secs=$(( SNAPSHOT_RETENTION_DAYS * 86400 ))
    local now
    now="$(date +%s)"
    local removed=0

    [[ -d "$BACKUP_DIR" ]] || return 0

    for backup in "${BACKUP_DIR}/${SNAPSHOT_PREFIX}"-*; do
        [[ -d "$backup" ]] || continue

        local created_epoch=0
        if [[ -f "${backup}/METADATA" ]]; then
            created_epoch="$(grep '^created_epoch=' "${backup}/METADATA" | cut -d= -f2-)" || true
            created_epoch="${created_epoch:-0}"
        fi

        # If no metadata, try parsing from directory name
        if [[ "$created_epoch" -eq 0 ]]; then
            local dir_name
            dir_name="$(basename "$backup")"
            local ts_part="${dir_name#${SNAPSHOT_PREFIX}-}"
            created_epoch="$(date -d "${ts_part:0:4}-${ts_part:4:2}-${ts_part:6:2} ${ts_part:9:2}:${ts_part:11:2}:${ts_part:13:2}" +%s 2>/dev/null || echo 0)"
        fi

        local age=$(( now - created_epoch ))
        if [[ $age -gt $retention_secs ]]; then
            local backup_name
            backup_name="$(basename "$backup")"
            log_info "Removing old file-level backup: $backup_name (age: $(( age / 86400 )) days)"
            if rm -rf "$backup"; then
                (( removed++ )) || true
            else
                log_warn "Failed to remove backup: $backup_name"
            fi
        fi
    done

    log_info "File-level backup cleanup complete — removed $removed backup(s)."
}

fallback_rollback() {
    local name="$1"
    local backup_path="${BACKUP_DIR}/${name}"

    if [[ ! -d "$backup_path" ]]; then
        log_error "File-level backup not found: $backup_path"
        return 3
    fi

    if [[ ! -f "${backup_path}/MANIFEST" ]]; then
        log_error "Backup manifest missing: ${backup_path}/MANIFEST"
        return 3
    fi

    log_warn "Restoring from file-level backup: $backup_path"

    local restored=0 failed=0

    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue

        if [[ "$entry" == files/* ]]; then
            # Restore file to its original location
            local relative_path="${entry#files/}"
            local source="${backup_path}/${entry}"
            local target="/${relative_path}"

            if [[ ! -f "$source" ]]; then
                log_warn "Backup file missing: $source"
                (( failed++ )) || true
                continue
            fi

            local target_dir
            target_dir="$(dirname "$target")"
            mkdir -p "$target_dir"

            if cp -a "$source" "$target" 2>/dev/null; then
                log_info "Restored: $target"
                (( restored++ )) || true
            else
                log_warn "Failed to restore: $target"
                (( failed++ )) || true
            fi
        elif [[ "$entry" == "state/" ]]; then
            # Restore state directory
            if [[ -d "${backup_path}/state" ]]; then
                cp -a "${backup_path}/state" "${STATE_DIR}/state" 2>/dev/null || true
                log_info "Restored: config-manager state"
                (( restored++ )) || true
            fi
        fi
    done < "${backup_path}/MANIFEST"

    log_info "File-level restore complete — restored: $restored, failed: $failed"
    [[ $failed -eq 0 ]] && return 0 || return 3
}

# ---------------------------------------------------------------------------
# Unified dispatch — routes commands to the detected backend
# ---------------------------------------------------------------------------
do_create() {
    local name
    name="$(snapshot_name)"

    mkdir -p "$STATE_DIR"

    case "$DETECTED_BACKEND" in
        zfs)   zfs_create "$name"      ;;
        lvm)   lvm_create "$name"      ;;
        btrfs) btrfs_create "$name"    ;;
        none)  fallback_create "$name" ;;
    esac

    # If we reach here, the backend succeeded (set -e would exit on failure)
    echo "$name" > "$SNAPSHOT_STATE_FILE"
    log_info "Snapshot recorded in state file: $name"
}

do_list() {
    case "$DETECTED_BACKEND" in
        zfs)   zfs_list      ;;
        lvm)   lvm_list      ;;
        btrfs) btrfs_list    ;;
        none)  fallback_list ;;
    esac
}

do_cleanup() {
    case "$DETECTED_BACKEND" in
        zfs)   zfs_cleanup      ;;
        lvm)   lvm_cleanup      ;;
        btrfs) btrfs_cleanup    ;;
        none)  fallback_cleanup ;;
    esac
}

do_rollback() {
    local name="$1"
    if [[ -z "$name" ]]; then
        log_error "Rollback requires a snapshot name. Use 'list' to see available snapshots."
        return 4
    fi

    case "$DETECTED_BACKEND" in
        zfs)   zfs_rollback "$name"      ;;
        lvm)   lvm_rollback "$name"      ;;
        btrfs) btrfs_rollback "$name"    ;;
        none)  fallback_rollback "$name" ;;
    esac
}

do_status() {
    log_info "Snapshot manager status:"
    log_info "  Enabled:        $SNAPSHOT_ENABLED"
    log_info "  Backend:        $DETECTED_BACKEND"
    log_info "  Retention:      $SNAPSHOT_RETENTION_DAYS days"
    log_info "  State dir:      $STATE_DIR"
    log_info "  Backup dir:     $BACKUP_DIR"

    case "$DETECTED_BACKEND" in
        zfs)
            log_info "  ZFS dataset:    ${ZFS_DATASET:-not detected}"
            ;;
        lvm)
            log_info "  LVM LV:         ${LVM_LV:-not detected}"
            log_info "  LVM snap size:  ${LVM_SNAPSHOT_SIZE:-1G}"
            ;;
        btrfs)
            log_info "  BTRFS snap dir: $BTRFS_SNAP_DIR"
            ;;
        none)
            log_info "  Mode:           file-level backup (no filesystem snapshot support)"
            ;;
    esac

    # Show last snapshot
    if [[ -f "$SNAPSHOT_STATE_FILE" ]]; then
        local last
        last="$(cat "$SNAPSHOT_STATE_FILE" 2>/dev/null || true)"
        log_info "  Last snapshot:  ${last:-none}"
    else
        log_info "  Last snapshot:  none"
    fi
}

# ---------------------------------------------------------------------------
# Tag a snapshot as "good" (post-sync success)
# Called by config-sync.sh after a successful sync.
# ---------------------------------------------------------------------------
tag_good() {
    if [[ ! -f "$SNAPSHOT_STATE_FILE" ]]; then
        log_info "No snapshot to tag — skipping."
        return 0
    fi

    local name
    name="$(cat "$SNAPSHOT_STATE_FILE" 2>/dev/null || true)"
    [[ -z "$name" ]] && return 0

    # For file-level backups, write a marker
    if [[ "$DETECTED_BACKEND" == "none" ]]; then
        local backup_path="${BACKUP_DIR}/${name}"
        if [[ -d "$backup_path" ]]; then
            echo "good" > "${backup_path}/STATUS"
            log_info "File-level backup tagged as good: $name"
        fi
    fi

    # For all backends, record in the state file
    echo "${name}:good" > "$SNAPSHOT_STATE_FILE"
    log_info "Snapshot tagged as good: $name"
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
    cat <<EOF
Usage: $(basename "$0") <command> [args]

Commands:
  create              Create a new pre-sync snapshot
  list                List available snapshots
  cleanup             Remove snapshots older than retention period
  rollback <name>     Restore system to the given snapshot
  status              Show detected backend and current state
  tag-good            Mark the last snapshot as successful

Configuration (via /etc/config-manager/config.env):
  SNAPSHOT_ENABLED=$SNAPSHOT_ENABLED
  SNAPSHOT_RETENTION_DAYS=$SNAPSHOT_RETENTION_DAYS
  SNAPSHOT_BACKEND=$SNAPSHOT_BACKEND
EOF
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    local command="${1:-}"
    shift 2>/dev/null || true

    # Load config and detect backend
    load_snapshot_config || exit $?
    detect_backend || exit $?

    # Check if snapshots are enabled
    if [[ "$command" != "status" ]]; then
        check_enabled || exit $?
    fi

    case "$command" in
        create)    do_create          ;;
        list)      do_list            ;;
        cleanup)   do_cleanup         ;;
        rollback)  do_rollback "$@"   ;;
        status)    do_status          ;;
        tag-good)  tag_good           ;;
        -h|--help) usage              ;;
        "")
            log_error "No command specified."
            usage
            exit 4
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 4
            ;;
    esac
}

# Only run main if executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

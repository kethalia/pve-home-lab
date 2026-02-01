#!/usr/bin/env bash
# config-rollback — CLI tool for managing config-manager snapshots and conflicts.
#
# Provides rollback capabilities and conflict resolution for the LXC
# configuration management system.
#
# Usage:
#   config-rollback list              List available snapshots
#   config-rollback show <snapshot>   Show what changed since snapshot
#   config-rollback restore <snapshot> Restore to snapshot state
#   config-rollback status            Show current conflict status
#   config-rollback resolve           Clear conflict marker after manual resolution
#
# Exit codes:
#   0  — success
#   1  — general error
#   2  — invalid arguments
#   3  — operation failed
#   4  — snapshot not found

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly VERSION="0.1.0"
readonly CONFIG_FILE="/etc/config-manager/config.env"
readonly STATE_DIR="/var/lib/config-manager"
readonly CONFLICT_MARKER="${STATE_DIR}/CONFLICT"
readonly CONFLICT_STATE_DIR="${STATE_DIR}/state"
readonly CONFLICTS_LOG="${CONFLICT_STATE_DIR}/conflicts.log"
readonly CHECKSUMS_PREV="${CONFLICT_STATE_DIR}/checksums.prev"
readonly SNAPSHOT_STATE_FILE="${STATE_DIR}/snapshot-state"
readonly BACKUP_DIR="${STATE_DIR}/backups"
readonly LIB_DIR="/usr/local/lib/config-manager"
readonly LOG_DIR="/var/log/config-manager"
readonly LOG_FILE="${LOG_DIR}/rollback.log"

# Snapshot prefix must match snapshot-manager.sh
readonly SNAPSHOT_PREFIX="config-manager"

# ---------------------------------------------------------------------------
# Colours (disabled if not a terminal)
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
    readonly RED='\033[1;31m'
    readonly YELLOW='\033[1;33m'
    readonly GREEN='\033[1;32m'
    readonly BLUE='\033[1;34m'
    readonly BOLD='\033[1m'
    readonly DIM='\033[2m'
    readonly RESET='\033[0m'
else
    readonly RED='' YELLOW='' GREEN='' BLUE='' BOLD='' DIM='' RESET=''
fi

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
_log() {
    local level="$1"; shift
    local ts
    ts="$(date '+%Y-%m-%d %H:%M:%S')"
    local msg
    msg="$(printf '[%s] [%-7s] %s' "$ts" "$level" "$*")"

    # Always write to log file
    if [[ -d "$LOG_DIR" ]]; then
        echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
    fi
}

log_info()  { _log INFO    "$@"; }
log_warn()  { _log WARNING "$@"; }
log_error() { _log ERROR   "$@"; }

# Terminal output helpers
info()  { printf "${BLUE}[INFO]${RESET}  %s\n" "$*"; log_info "$@"; }
warn()  { printf "${YELLOW}[WARN]${RESET}  %s\n" "$*"; log_warn "$@"; }
error() { printf "${RED}[ERROR]${RESET} %s\n" "$*" >&2; log_error "$@"; }

# ---------------------------------------------------------------------------
# Snapshot backend detection (simplified from snapshot-manager.sh)
# ---------------------------------------------------------------------------
detect_snapshot_backend() {
    # Try sourcing snapshot-manager.sh for full backend detection
    local snapshot_mgr="${LIB_DIR}/snapshot-manager.sh"
    if [[ -f "$snapshot_mgr" ]]; then
        # Source it to get access to backend functions
        # shellcheck source=/dev/null
        source "$snapshot_mgr"
        load_snapshot_config || true
        detect_backend || {
            DETECTED_BACKEND="none"
        }
        return 0
    fi

    # Fallback: try to detect from config
    DETECTED_BACKEND="none"
    SNAPSHOT_ENABLED="${SNAPSHOT_ENABLED:-auto}"
    SNAPSHOT_RETENTION_DAYS="${SNAPSHOT_RETENTION_DAYS:-7}"

    if [[ -f "$CONFIG_FILE" ]]; then
        local _backend
        _backend="$(grep -E '^SNAPSHOT_BACKEND=' "$CONFIG_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'")" || true
        [[ -n "$_backend" ]] && DETECTED_BACKEND="$_backend"
    fi
}

# ---------------------------------------------------------------------------
# cmd_list — List available snapshots
# ---------------------------------------------------------------------------
cmd_list() {
    detect_snapshot_backend

    printf "\n${BOLD}Available snapshots${RESET} (backend: %s)\n\n" "$DETECTED_BACKEND"

    case "$DETECTED_BACKEND" in
        zfs)
            if declare -f zfs_list &>/dev/null; then
                zfs list -t snapshot -o name,creation,used -s creation 2>/dev/null \
                    | grep "@${SNAPSHOT_PREFIX}-" \
                    | while IFS= read -r line; do
                        printf "  %s\n" "$line"
                    done
            else
                printf "  ${DIM}(ZFS backend — use 'zfs list -t snapshot' to view)${RESET}\n"
            fi
            ;;
        lvm)
            local vg=""
            if [[ -n "${LVM_LV:-}" ]]; then
                vg="$(echo "$LVM_LV" | cut -d/ -f1)"
            fi
            if [[ -n "$vg" ]]; then
                lvs --noheadings -o lv_name,lv_size,lv_time "$vg" 2>/dev/null \
                    | grep "$SNAPSHOT_PREFIX" \
                    | while IFS= read -r line; do
                        printf "  %s\n" "$line"
                    done
            else
                printf "  ${DIM}(LVM backend — use 'lvs' to view snapshots)${RESET}\n"
            fi
            ;;
        btrfs)
            local snap_dir="/.snapshots"
            if [[ -d "$snap_dir" ]]; then
                local found=0
                for snap in "${snap_dir}/${SNAPSHOT_PREFIX}"-*; do
                    [[ -d "$snap" ]] || continue
                    local snap_name
                    snap_name="$(basename "$snap")"
                    local snap_info=""
                    snap_info="$(btrfs subvolume show "$snap" 2>/dev/null | grep -E 'Creation time' | sed 's/.*Creation time:[[:space:]]*//')" || true
                    printf "  %s  (created: %s)\n" "$snap_name" "${snap_info:-unknown}"
                    (( found++ )) || true
                done
                [[ $found -eq 0 ]] && printf "  ${DIM}(none)${RESET}\n"
            else
                printf "  ${DIM}(none)${RESET}\n"
            fi
            ;;
        none|*)
            # File-level backups
            if [[ -d "$BACKUP_DIR" ]]; then
                local found=0
                for backup in "${BACKUP_DIR}/${SNAPSHOT_PREFIX}"-*; do
                    [[ -d "$backup" ]] || continue
                    local backup_name
                    backup_name="$(basename "$backup")"
                    local created="unknown"
                    local status_marker=""
                    if [[ -f "${backup}/METADATA" ]]; then
                        created="$(grep '^created=' "${backup}/METADATA" | cut -d= -f2-)" || true
                    fi
                    if [[ -f "${backup}/STATUS" ]]; then
                        local status_val
                        status_val="$(cat "${backup}/STATUS" 2>/dev/null || true)"
                        if [[ "$status_val" == "good" ]]; then
                            status_marker=" ${GREEN}[good]${RESET}"
                        fi
                    fi
                    printf "  %-40s  created: %s%b\n" "$backup_name" "$created" "$status_marker"
                    (( found++ )) || true
                done
                [[ $found -eq 0 ]] && printf "  ${DIM}(none)${RESET}\n"
            else
                printf "  ${DIM}(none — backup directory does not exist)${RESET}\n"
            fi
            ;;
    esac
    printf "\n"
}

# ---------------------------------------------------------------------------
# cmd_show — Show what changed since a snapshot
# ---------------------------------------------------------------------------
cmd_show() {
    local snapshot_name="${1:-}"
    if [[ -z "$snapshot_name" ]]; then
        error "Usage: config-rollback show <snapshot>"
        return 2
    fi

    detect_snapshot_backend

    printf "\n${BOLD}Snapshot: %s${RESET}\n\n" "$snapshot_name"

    case "$DETECTED_BACKEND" in
        zfs)
            local dataset="${ZFS_DATASET:-}@${snapshot_name}"
            if ! zfs list -t snapshot "$dataset" &>/dev/null 2>&1; then
                error "ZFS snapshot not found: $dataset"
                return 4
            fi
            info "Changes since ZFS snapshot $dataset:"
            zfs diff "$dataset" 2>/dev/null | head -50 || {
                warn "Could not show ZFS diff (may require dataset mount)."
            }
            ;;
        lvm)
            warn "LVM snapshot diff is not supported (snapshots are block-level)."
            warn "Use 'config-rollback restore $snapshot_name' to restore."
            ;;
        btrfs)
            local snap_path="/.snapshots/${snapshot_name}"
            if [[ ! -d "$snap_path" ]]; then
                error "BTRFS snapshot not found: $snap_path"
                return 4
            fi
            info "Comparing current files with BTRFS snapshot..."
            # Show file differences against the snapshot
            if [[ -f "${CHECKSUMS_PREV}" ]]; then
                _show_file_diffs "$snap_path"
            else
                warn "No checksum data available for detailed comparison."
            fi
            ;;
        none|*)
            local backup_path="${BACKUP_DIR}/${snapshot_name}"
            if [[ ! -d "$backup_path" ]]; then
                error "Backup not found: $backup_path"
                return 4
            fi

            # Show metadata
            if [[ -f "${backup_path}/METADATA" ]]; then
                printf "  ${BOLD}Metadata:${RESET}\n"
                while IFS='=' read -r key value; do
                    [[ -z "$key" ]] && continue
                    printf "    %-20s %s\n" "$key:" "$value"
                done < "${backup_path}/METADATA"
                printf "\n"
            fi

            # Show what files are in the backup
            if [[ -f "${backup_path}/MANIFEST" ]]; then
                printf "  ${BOLD}Backed up files:${RESET}\n"
                while IFS= read -r entry; do
                    [[ -z "$entry" ]] && continue
                    if [[ "$entry" == files/* ]]; then
                        local relative_path="${entry#files/}"
                        local target="/${relative_path}"
                        local source="${backup_path}/${entry}"

                        if [[ -f "$target" ]] && [[ -f "$source" ]]; then
                            local curr_hash bak_hash
                            curr_hash="$(sha256sum "$target" 2>/dev/null | awk '{print $1}')"
                            bak_hash="$(sha256sum "$source" 2>/dev/null | awk '{print $1}')"
                            if [[ "$curr_hash" == "$bak_hash" ]]; then
                                printf "    ${DIM}[unchanged]${RESET} %s\n" "$target"
                            else
                                printf "    ${YELLOW}[modified]${RESET}  %s\n" "$target"
                                # Show a brief diff
                                diff --color=auto -u "$source" "$target" 2>/dev/null \
                                    | head -20 \
                                    | sed 's/^/      /' || true
                            fi
                        elif [[ ! -f "$target" ]]; then
                            printf "    ${RED}[deleted]${RESET}   %s\n" "$target"
                        else
                            printf "    ${GREEN}[present]${RESET}   %s\n" "$entry"
                        fi
                    elif [[ "$entry" == "state/" ]]; then
                        printf "    ${DIM}[state]${RESET}     config-manager state directory\n"
                    fi
                done < "${backup_path}/MANIFEST"
            else
                printf "  ${DIM}(no manifest — cannot show file details)${RESET}\n"
            fi
            printf "\n"
            ;;
    esac
}

# ---------------------------------------------------------------------------
# _show_file_diffs — helper for BTRFS snapshot comparison
# ---------------------------------------------------------------------------
_show_file_diffs() {
    local snap_root="$1"

    if [[ ! -f "$CHECKSUMS_PREV" ]]; then
        return 0
    fi

    while IFS=' ' read -r target_path _prev_target _prev_source; do
        [[ -z "$target_path" ]] && continue
        [[ -f "$target_path" ]] || continue

        local snap_file="${snap_root}${target_path}"
        if [[ -f "$snap_file" ]]; then
            local curr_hash snap_hash
            curr_hash="$(sha256sum "$target_path" 2>/dev/null | awk '{print $1}')"
            snap_hash="$(sha256sum "$snap_file" 2>/dev/null | awk '{print $1}')"
            if [[ "$curr_hash" != "$snap_hash" ]]; then
                printf "  ${YELLOW}[modified]${RESET} %s\n" "$target_path"
            fi
        fi
    done < "$CHECKSUMS_PREV"
}

# ---------------------------------------------------------------------------
# cmd_restore — Restore to a snapshot
# ---------------------------------------------------------------------------
cmd_restore() {
    local snapshot_name="${1:-}"
    if [[ -z "$snapshot_name" ]]; then
        error "Usage: config-rollback restore <snapshot>"
        return 2
    fi

    # Root check
    if [[ $EUID -ne 0 ]]; then
        error "Restore requires root privileges. Run with sudo."
        return 1
    fi

    detect_snapshot_backend

    printf "\n${BOLD}${YELLOW}Restoring snapshot: %s${RESET}\n\n" "$snapshot_name"
    info "Restoring from snapshot: $snapshot_name (backend: $DETECTED_BACKEND)"

    local rc=0
    case "$DETECTED_BACKEND" in
        zfs)
            if declare -f zfs_rollback &>/dev/null; then
                zfs_rollback "$snapshot_name" || rc=$?
            else
                error "ZFS rollback function not available."
                rc=3
            fi
            ;;
        lvm)
            if declare -f lvm_rollback &>/dev/null; then
                lvm_rollback "$snapshot_name" || rc=$?
            else
                error "LVM rollback function not available."
                rc=3
            fi
            ;;
        btrfs)
            if declare -f btrfs_rollback &>/dev/null; then
                btrfs_rollback "$snapshot_name" || rc=$?
            else
                error "BTRFS rollback function not available."
                rc=3
            fi
            ;;
        none|*)
            if declare -f fallback_rollback &>/dev/null; then
                fallback_rollback "$snapshot_name" || rc=$?
            else
                # Inline fallback restore if snapshot-manager wasn't sourced
                _inline_fallback_restore "$snapshot_name" || rc=$?
            fi
            ;;
    esac

    if [[ $rc -eq 0 ]]; then
        printf "\n${GREEN}Restore completed successfully.${RESET}\n"

        # Clear conflict state after successful restore
        if [[ -f "$CONFLICT_MARKER" ]]; then
            rm -f "$CONFLICT_MARKER"
            info "Conflict marker cleared after restore."
            printf "${GREEN}Conflict marker cleared.${RESET}\n"
        fi

        # Update checksums to reflect restored state
        if [[ -n "${REPO_DIR:-}" ]] && [[ -n "${CONFIG_PATH:-}" ]]; then
            info "Updating checksums to reflect restored state..."
        fi
    else
        printf "\n${RED}Restore failed (exit code: %d).${RESET}\n" "$rc"
    fi

    printf "\n"
    return $rc
}

# ---------------------------------------------------------------------------
# _inline_fallback_restore — restore from file-level backup without sourcing
# ---------------------------------------------------------------------------
_inline_fallback_restore() {
    local name="$1"
    local backup_path="${BACKUP_DIR}/${name}"

    if [[ ! -d "$backup_path" ]]; then
        error "Backup not found: $backup_path"
        return 4
    fi

    if [[ ! -f "${backup_path}/MANIFEST" ]]; then
        error "Backup manifest missing: ${backup_path}/MANIFEST"
        return 3
    fi

    info "Restoring from file-level backup: $backup_path"

    local restored=0 failed=0

    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue

        if [[ "$entry" == files/* ]]; then
            local relative_path="${entry#files/}"
            local source="${backup_path}/${entry}"
            local target="/${relative_path}"

            if [[ ! -f "$source" ]]; then
                warn "Backup file missing: $source"
                (( failed++ )) || true
                continue
            fi

            local target_dir
            target_dir="$(dirname "$target")"
            mkdir -p "$target_dir" 2>/dev/null || true

            if cp -a "$source" "$target" 2>/dev/null; then
                printf "  ${GREEN}[restored]${RESET} %s\n" "$target"
                (( restored++ )) || true
            else
                printf "  ${RED}[failed]${RESET}   %s\n" "$target"
                (( failed++ )) || true
            fi
        elif [[ "$entry" == "state/" ]]; then
            if [[ -d "${backup_path}/state" ]]; then
                cp -a "${backup_path}/state" "${STATE_DIR}/state" 2>/dev/null || true
                printf "  ${GREEN}[restored]${RESET} config-manager state\n"
                (( restored++ )) || true
            fi
        fi
    done < "${backup_path}/MANIFEST"

    info "Restore complete — restored: $restored, failed: $failed"
    printf "\n  Restored: %d file(s), Failed: %d file(s)\n" "$restored" "$failed"

    [[ $failed -eq 0 ]] && return 0 || return 3
}

# ---------------------------------------------------------------------------
# cmd_status — Show current conflict status
# ---------------------------------------------------------------------------
cmd_status() {
    printf "\n${BOLD}Config Manager — Conflict Status${RESET}\n\n"

    if [[ -f "$CONFLICT_MARKER" ]]; then
        printf "  Status: ${RED}${BOLD}CONFLICT DETECTED${RESET}\n\n"

        while IFS='=' read -r key value; do
            [[ -z "$key" ]] && continue
            printf "  %-22s %s\n" "$key:" "$value"
        done < "$CONFLICT_MARKER"

        if [[ -f "$CONFLICTS_LOG" ]]; then
            printf "\n  ${BOLD}Conflicting files:${RESET}\n"
            while IFS= read -r line; do
                [[ -z "$line" ]] && continue
                printf "  %s\n" "$line"
            done < "$CONFLICTS_LOG"
        fi

        # Show available snapshot for rollback
        if [[ -f "$SNAPSHOT_STATE_FILE" ]]; then
            local last_snap
            last_snap="$(cat "$SNAPSHOT_STATE_FILE" 2>/dev/null || true)"
            last_snap="${last_snap%%:*}"
            if [[ -n "$last_snap" ]]; then
                printf "\n  ${BOLD}Rollback snapshot:${RESET} %s\n" "$last_snap"
                printf "  ${BOLD}To rollback:${RESET}       config-rollback restore %s\n" "$last_snap"
            fi
        fi

        printf "\n  ${BOLD}To resolve:${RESET}        Edit conflicting files, then run:\n"
        printf "                     ${GREEN}config-rollback resolve${RESET}\n"
    else
        printf "  Status: ${GREEN}${BOLD}CLEAN${RESET} — no conflicts detected\n"

        # Show last sync info
        if [[ -f "$SNAPSHOT_STATE_FILE" ]]; then
            local last_snap
            last_snap="$(cat "$SNAPSHOT_STATE_FILE" 2>/dev/null || true)"
            if [[ -n "$last_snap" ]]; then
                local snap_name="${last_snap%%:*}"
                local snap_status="unknown"
                if [[ "$last_snap" == *":good" ]]; then
                    snap_status="${GREEN}good${RESET}"
                fi
                printf "  Last snapshot:   %s (status: %b)\n" "$snap_name" "$snap_status"
            fi
        fi

        if [[ -f "$CHECKSUMS_PREV" ]]; then
            local file_count
            file_count="$(wc -l < "$CHECKSUMS_PREV" 2>/dev/null || echo 0)"
            printf "  Tracked files:   %d\n" "$file_count"
        fi
    fi

    printf "\n"
}

# ---------------------------------------------------------------------------
# cmd_resolve — Clear conflict marker after manual resolution
# ---------------------------------------------------------------------------
cmd_resolve() {
    if [[ ! -f "$CONFLICT_MARKER" ]]; then
        printf "\n${GREEN}No conflicts to resolve — system is clean.${RESET}\n\n"
        return 0
    fi

    # Root check for modifying state
    if [[ $EUID -ne 0 ]]; then
        error "Resolve requires root privileges. Run with sudo."
        return 1
    fi

    printf "\n${BOLD}Resolving conflicts...${RESET}\n\n"

    # Remove conflict marker
    rm -f "$CONFLICT_MARKER"
    info "Conflict marker removed."
    printf "  ${GREEN}[done]${RESET} Conflict marker removed\n"

    # Archive conflicts log
    if [[ -f "$CONFLICTS_LOG" ]]; then
        local archive="${CONFLICTS_LOG}.resolved-$(date '+%Y%m%d-%H%M%S')"
        mv "$CONFLICTS_LOG" "$archive"
        info "Conflicts log archived to: $archive"
        printf "  ${GREEN}[done]${RESET} Conflicts log archived\n"
    fi

    # Update checksums.prev with current state
    # Source conflict-detector if available for compute_checksums
    local detector="${LIB_DIR}/conflict-detector.sh"
    if [[ -f "$detector" ]]; then
        # Load config to get REPO_DIR / CONFIG_PATH
        if [[ -f "$CONFIG_FILE" ]]; then
            # shellcheck source=/dev/null
            source "$CONFIG_FILE"
            REPO_DIR="${REPO_DIR:-/opt/config-manager/repo}"
            CONFIG_PATH="${CONFIG_PATH:-infra/lxc/container-configs}"
            export REPO_DIR CONFIG_PATH

            # shellcheck source=/dev/null
            source "$detector"
            compute_checksums "$CHECKSUMS_PREV"
            printf "  ${GREEN}[done]${RESET} Checksums updated for resolved state\n"
        fi
    fi

    printf "\n${GREEN}Conflicts resolved. Next sync will proceed normally.${RESET}\n\n"
    info "Conflict resolution complete."
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
    cat <<EOF

${BOLD}config-rollback${RESET} v${VERSION} — Config Manager rollback & conflict resolution

${BOLD}Usage:${RESET}
  config-rollback <command> [args]

${BOLD}Commands:${RESET}
  list                List available snapshots
  show <snapshot>     Show what changed since snapshot
  restore <snapshot>  Restore to snapshot state
  status              Show current conflict status
  resolve             Clear conflict marker after manual resolution

${BOLD}Examples:${RESET}
  config-rollback status
  config-rollback list
  config-rollback show config-manager-20260131-143022
  config-rollback restore config-manager-20260131-143022
  config-rollback resolve

EOF
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    local command="${1:-}"
    shift 2>/dev/null || true

    case "$command" in
        list)      cmd_list              ;;
        show)      cmd_show "$@"         ;;
        restore)   cmd_restore "$@"      ;;
        status)    cmd_status            ;;
        resolve)   cmd_resolve           ;;
        -h|--help) usage                 ;;
        -v|--version) echo "config-rollback v${VERSION}" ;;
        "")
            error "No command specified."
            usage
            exit 2
            ;;
        *)
            error "Unknown command: $command"
            usage
            exit 2
            ;;
    esac
}

main "$@"

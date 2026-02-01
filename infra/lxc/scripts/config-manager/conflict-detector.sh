#!/usr/bin/env bash
# conflict-detector.sh — Conflict detection between local changes and git updates.
#
# Detects when managed files have been modified locally AND changed in an
# incoming git update, preventing silent overwrites of manual edits.
#
# Detection flow:
#   1. Before sync: compute checksums of all managed files at target paths
#   2. After git pull: compare local target checksums with previous sync checksums
#   3. If file was modified locally AND changed in git → CONFLICT
#   4. If file was modified locally but NOT changed in git → OK (skip per policy)
#   5. If file was NOT modified locally but changed in git → OK (apply update)
#
# State files (in /var/lib/config-manager/state/):
#   checksums.prev    — checksums from last successful sync
#   checksums.current — checksums computed at sync start
#   conflicts.log     — detected conflicts (if any)
#
# This script is sourced by config-sync.sh and expects:
#   log_info, log_warn, log_error — logging helpers
#   REPO_DIR, CONFIG_PATH         — repository paths
#
# Exit codes (when run standalone):
#   0  — no conflicts detected
#   1  — general error
#   5  — conflicts detected (sync should abort)

set -euo pipefail

# Guard against double-sourcing
[[ -n "${_CONFLICT_DETECTOR_LOADED:-}" ]] && return 0
readonly _CONFLICT_DETECTOR_LOADED=1

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly CONFLICT_STATE_DIR="/var/lib/config-manager/state"
readonly CHECKSUMS_PREV="${CONFLICT_STATE_DIR}/checksums.prev"
readonly CHECKSUMS_CURRENT="${CONFLICT_STATE_DIR}/checksums.current"
readonly CONFLICTS_LOG="${CONFLICT_STATE_DIR}/conflicts.log"
readonly CONFLICT_MARKER="/var/lib/config-manager/CONFLICT"

# Exit codes
readonly EXIT_CONFLICT=5

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
# Helpers
# ---------------------------------------------------------------------------

# checksum_file <path> — print SHA-256 hash of a file
_conflict_checksum() {
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
}

# ---------------------------------------------------------------------------
# compute_checksums — record checksums of all managed files at targets
#
# Reads the file triplets from the repo's files/ directory and computes
# checksums for each target path (the deployed location on disk).
# Also computes checksums of the source files in the git repo.
#
# Output format (one line per file):
#   <target_path>\t<target_checksum>\t<source_checksum>
#
# If a target file doesn't exist yet, its checksum is recorded as "MISSING".
# ---------------------------------------------------------------------------
compute_checksums() {
    local files_dir="${REPO_DIR}/${CONFIG_PATH}/files"
    local output_file="$1"

    mkdir -p "$CONFLICT_STATE_DIR"
    : > "$output_file"

    if [[ ! -d "$files_dir" ]]; then
        log_info "[Conflict] No files/ directory — nothing to checksum."
        return 0
    fi

    local count=0

    for source_file in "$files_dir"/*; do
        [[ -e "$source_file" ]] || continue
        [[ -f "$source_file" ]] || continue

        local basename
        basename="$(basename "$source_file")"

        # Skip metadata files (.path / .policy)
        [[ "$basename" == *.path ]] && continue
        [[ "$basename" == *.policy ]] && continue

        local path_file="${source_file}.path"
        [[ -f "$path_file" ]] || continue

        local target_dir
        target_dir="$(head -n 1 "$path_file" | tr -d '[:space:]')"
        [[ -z "$target_dir" ]] && continue

        local target_file="${target_dir}/${basename}"
        local target_hash="MISSING"
        local source_hash

        source_hash="$(_conflict_checksum "$source_file")"
        
        # Validate source checksum was computed successfully
        if [[ -z "$source_hash" ]]; then
            log_warn "[Conflict] Could not compute checksum for $source_file — skipping"
            continue
        fi

        if [[ -f "$target_file" ]]; then
            target_hash="$(_conflict_checksum "$target_file")"
            # If target exists but checksum fails, treat as changed to be safe
            if [[ -z "$target_hash" ]]; then
                log_warn "[Conflict] Could not compute checksum for $target_file — marking as changed"
                target_hash="CHECKSUM_FAILED"
            fi
        fi

        printf '%s\t%s\t%s\n' "$target_file" "$target_hash" "$source_hash" >> "$output_file"
        (( count++ )) || true
    done

    log_info "[Conflict] Computed checksums for $count managed file(s)."
}

# ---------------------------------------------------------------------------
# record_pre_sync_checksums — Step 1: record state before git pull
#
# Called BEFORE git_sync to capture the current state of deployed files
# and the current repo source files.
# ---------------------------------------------------------------------------
record_pre_sync_checksums() {
    log_info "[Conflict] Recording pre-sync checksums..."
    compute_checksums "$CHECKSUMS_CURRENT"
}

# ---------------------------------------------------------------------------
# detect_conflicts — Step 2: compare pre-sync state with post-pull state
#
# Called AFTER git_sync. Compares:
#   - checksums.prev (from last successful sync): what we last deployed
#   - checksums.current (recorded before this sync): what's on disk now
#   - New source checksums (from the freshly pulled repo)
#
# Returns 0 if no conflicts, 5 if conflicts detected.
# ---------------------------------------------------------------------------
detect_conflicts() {
    log_info "[Conflict] Checking for conflicts..."

    mkdir -p "$CONFLICT_STATE_DIR"
    : > "$CONFLICTS_LOG"

    local files_dir="${REPO_DIR}/${CONFIG_PATH}/files"
    local conflict_count=0
    local checked_count=0

    # If there's no previous sync record, this is the first sync — no conflicts possible
    if [[ ! -f "$CHECKSUMS_PREV" ]]; then
        log_info "[Conflict] No previous sync checksums found — first sync, skipping conflict detection."
        return 0
    fi

    # If no current checksums were recorded, skip
    if [[ ! -f "$CHECKSUMS_CURRENT" ]]; then
        log_info "[Conflict] No current checksums recorded — skipping conflict detection."
        return 0
    fi

    if [[ ! -d "$files_dir" ]]; then
        log_info "[Conflict] No files/ directory in repo — no conflicts possible."
        return 0
    fi

    # Build associative arrays from the checksum files for fast lookup
    # checksums.prev format: <target_path> <target_checksum_at_last_sync> <source_checksum_at_last_sync>
    # checksums.current format: <target_path> <target_checksum_now> <source_checksum_before_pull>
    declare -A prev_target_checksums
    declare -A prev_source_checksums

    while IFS=$'\t' read -r path target_hash source_hash; do
        [[ -z "$path" ]] && continue
        [[ -z "$target_hash" ]] && continue
        [[ -z "$source_hash" ]] && continue
        prev_target_checksums["$path"]="$target_hash"
        prev_source_checksums["$path"]="$source_hash"
    done < "$CHECKSUMS_PREV"

    declare -A current_target_checksums

    while IFS=$'\t' read -r path target_hash _source_hash; do
        [[ -z "$path" ]] && continue
        [[ -z "$target_hash" ]] && continue
        current_target_checksums["$path"]="$target_hash"
    done < "$CHECKSUMS_CURRENT"

    # Now check each file in the freshly-pulled repo
    for source_file in "$files_dir"/*; do
        [[ -e "$source_file" ]] || continue
        [[ -f "$source_file" ]] || continue

        local basename
        basename="$(basename "$source_file")"

        [[ "$basename" == *.path ]] && continue
        [[ "$basename" == *.policy ]] && continue

        local path_file="${source_file}.path"
        [[ -f "$path_file" ]] || continue

        local target_dir
        target_dir="$(head -n 1 "$path_file" | tr -d '[:space:]')"
        [[ -z "$target_dir" ]] && continue

        local target_path="${target_dir}/${basename}"
        (( checked_count++ )) || true

        # Get the new source checksum (after git pull)
        local new_source_hash
        new_source_hash="$(_conflict_checksum "$source_file")"
        
        # Skip if checksum computation failed
        if [[ -z "$new_source_hash" ]]; then
            log_warn "[Conflict] Could not compute checksum for $source_file — skipping conflict check"
            continue
        fi

        # Get previous checksums (from last successful sync)
        local prev_source="${prev_source_checksums[$target_path]:-}"
        local prev_target="${prev_target_checksums[$target_path]:-}"

        # Get current target checksum (what's on disk right now)
        local current_target="${current_target_checksums[$target_path]:-MISSING}"

        # Skip files that are new (not in previous sync)
        if [[ -z "$prev_source" ]]; then
            log_info "[Conflict] New file in repo: ${basename} — no conflict possible."
            continue
        fi

        # Check condition: file changed in git?
        local git_changed=false
        if [[ "$new_source_hash" != "$prev_source" ]]; then
            git_changed=true
        fi

        # Check condition: file modified locally?
        # Compare what's on disk now vs what we last deployed (prev target checksum)
        # This includes deletions (current_target == "MISSING" but prev_target != "MISSING")
        local locally_modified=false
        if [[ "$current_target" != "$prev_target" ]]; then
            locally_modified=true
        fi

        # Conflict: both local AND git changed
        if [[ "$git_changed" == true ]] && [[ "$locally_modified" == true ]]; then
            (( conflict_count++ )) || true

            # Log conflict details to conflicts.log
            {
                printf '\n  %s\n' "$target_path"
                printf '    Local checksum:  %s\n' "$current_target"
                printf '    Expected:        %s\n' "$prev_target"
                printf '    Git incoming:    %s\n' "$new_source_hash"
            } >> "$CONFLICTS_LOG"

            # Log to info level with compact format — full details in conflicts.log
            log_info "[Conflict] CONFLICT detected: $target_path (local: ${current_target:0:8}..., expected: ${prev_target:0:8}..., incoming: ${new_source_hash:0:8}...)"
        fi
    done

    if [[ $conflict_count -gt 0 ]]; then
        log_warn "[Conflict] Checked $checked_count file(s), found $conflict_count conflict(s) — see $CONFLICTS_LOG for details"
        _handle_conflicts "$conflict_count"
        return $EXIT_CONFLICT
    fi
    
    log_info "[Conflict] Checked $checked_count file(s), no conflicts detected."

    # Clean up any stale conflict marker from a previous run
    if [[ -f "$CONFLICT_MARKER" ]]; then
        rm -f "$CONFLICT_MARKER"
        log_info "[Conflict] Cleared stale conflict marker from previous run."
    fi

    return 0
}

# ---------------------------------------------------------------------------
# _handle_conflicts — actions when conflicts are detected
# ---------------------------------------------------------------------------
_handle_conflicts() {
    local count="$1"

    # 1. Create CONFLICT marker file
    {
        printf 'conflict_detected=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
        printf 'conflict_count=%d\n' "$count"
        printf 'conflicts_log=%s\n' "$CONFLICTS_LOG"
    } > "$CONFLICT_MARKER"

    log_error "════════════════════════════════════════════════════════════"
    log_error "[CONFLICT] Sync aborted — manual changes detected"
    log_error "════════════════════════════════════════════════════════════"

    # 2. Print conflict details from the log
    if [[ -f "$CONFLICTS_LOG" ]]; then
        while IFS= read -r line; do
            log_error "$line"
        done < "$CONFLICTS_LOG"
    fi

    # 3. Print snapshot info if available
    local snapshot_name=""
    if [[ -f "/var/lib/config-manager/snapshot-state" ]]; then
        snapshot_name="$(cat /var/lib/config-manager/snapshot-state 2>/dev/null || true)"
        # Strip any :good suffix
        snapshot_name="${snapshot_name%%:*}"
    fi

    if [[ -n "$snapshot_name" ]]; then
        log_error ""
        log_error "  Snapshot preserved: $snapshot_name"
        log_error ""
        log_error "  To rollback:  config-rollback restore $snapshot_name"
    fi

    log_error "  To resolve:   Edit conflicting files, then run: config-rollback resolve"
    log_error ""
    log_error "  Conflict log: $CONFLICTS_LOG"
    log_error "  Marker file:  $CONFLICT_MARKER"
    log_error "════════════════════════════════════════════════════════════"

    # 4. Write to systemd journal if available
    if command -v systemd-cat &>/dev/null; then
        printf '[CONFLICT] config-manager sync aborted — %d conflicting file(s) detected. Run: config-rollback status' "$count" \
            | systemd-cat -t config-manager -p warning 2>/dev/null || true
    fi
}

# ---------------------------------------------------------------------------
# save_successful_checksums — record checksums after a successful sync
#
# Called after all phases complete successfully. Computes fresh checksums
# of the deployed files and saves them as checksums.prev for next run.
# ---------------------------------------------------------------------------
save_successful_checksums() {
    log_info "[Conflict] Saving post-sync checksums for next run..."
    compute_checksums "$CHECKSUMS_PREV"
    log_info "[Conflict] Checksums saved to $CHECKSUMS_PREV"
}

# ---------------------------------------------------------------------------
# has_conflicts — check if a CONFLICT marker exists (for external tools)
# ---------------------------------------------------------------------------
has_conflicts() {
    [[ -f "$CONFLICT_MARKER" ]]
}

# ---------------------------------------------------------------------------
# get_conflict_status — print conflict status for external tools
# ---------------------------------------------------------------------------
get_conflict_status() {
    if [[ -f "$CONFLICT_MARKER" ]]; then
        log_warn "CONFLICT STATE: Active"
        while IFS='=' read -r key value; do
            [[ -z "$key" ]] && continue
            log_warn "  $key: $value"
        done < "$CONFLICT_MARKER"

        if [[ -f "$CONFLICTS_LOG" ]]; then
            log_warn ""
            log_warn "Conflicting files:"
            while IFS= read -r line; do
                log_warn "$line"
            done < "$CONFLICTS_LOG"
        fi

        log_warn ""
        log_warn "To resolve: Edit conflicting files, then run: config-rollback resolve"
        return 0
    else
        log_info "No conflicts detected. System is clean."
        return 1
    fi
}

# ---------------------------------------------------------------------------
# clear_conflicts — remove conflict marker (after manual resolution)
# ---------------------------------------------------------------------------
clear_conflicts() {
    if [[ ! -f "$CONFLICT_MARKER" ]]; then
        log_info "No conflict marker found — nothing to clear."
        return 0
    fi

    rm -f "$CONFLICT_MARKER"
    log_info "Conflict marker cleared."

    # Archive the conflicts log instead of deleting it
    if [[ -f "$CONFLICTS_LOG" ]]; then
        local archive="${CONFLICTS_LOG}.resolved-$(date '+%Y%m%d-%H%M%S')"
        mv "$CONFLICTS_LOG" "$archive"
        log_info "Conflicts log archived to: $archive"
    fi

    # Update checksums.prev with current state so next sync uses resolved state
    if [[ -n "${REPO_DIR:-}" ]] && [[ -n "${CONFIG_PATH:-}" ]]; then
        log_info "Updating checksums to reflect resolved state..."
        compute_checksums "$CHECKSUMS_PREV"
    else
        log_warn "Cannot update checksums (REPO_DIR or CONFIG_PATH not set)."
        log_warn "Run the next config-sync to update checksums automatically."
    fi

    log_info "Conflict resolved. Next sync will proceed normally."
}

# ---------------------------------------------------------------------------
# Main (standalone mode)
# ---------------------------------------------------------------------------
main() {
    local command="${1:-}"

    case "$command" in
        status)
            get_conflict_status
            ;;
        clear|resolve)
            clear_conflicts
            ;;
        -h|--help)
            echo "Usage: $(basename "$0") {status|clear|resolve}"
            echo ""
            echo "Commands:"
            echo "  status   Show current conflict status"
            echo "  clear    Clear conflict marker after manual resolution"
            echo "  resolve  Alias for clear"
            ;;
        *)
            echo "Usage: $(basename "$0") {status|clear|resolve}" >&2
            exit 1
            ;;
    esac
}

# Only run main if executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

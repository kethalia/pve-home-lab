#!/usr/bin/env bash
# process-files.sh — File deployment engine with policy-based management.
#
# Reads file triplets from the container-configs/files/ directory and deploys
# them to their target locations according to the specified policy.
#
# File triplet convention:
#   <name>         — the actual configuration file
#   <name>.path    — single line: target directory (e.g. /etc/nginx/conf.d)
#   <name>.policy  — single line: replace | default | backup
#
# Policy behaviour:
#   replace  — always overwrite the target (or copy if missing)
#   default  — copy only if the target does not exist (preserve user changes)
#   backup   — move existing target to <name>.backup-YYYYMMDD-HHMMSS, then copy
#
# This script is sourced/called by config-sync.sh and expects the following
# functions and variables to be available:
#   log_info, log_warn, log_error  — logging helpers
#   REPO_DIR, CONFIG_PATH          — repository paths
#
# It can also be run standalone for testing:
#   REPO_DIR=/opt/config-manager/repo CONFIG_PATH=infra/lxc/container-configs \
#     bash process-files.sh [--dry-run]

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
# Counters for summary
# ---------------------------------------------------------------------------
FILES_PROCESSED=0
FILES_DEPLOYED=0
FILES_SKIPPED=0
FILES_BACKED_UP=0
FILES_ERRORED=0

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
# Helpers
# ---------------------------------------------------------------------------

# checksum_file <path> — print SHA-256 hash of a file
checksum_file() {
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
}

# owner_of <path> — print uid:gid of a file/directory
owner_of() {
    stat -c '%u:%g' "$1" 2>/dev/null
}

# is_metadata <filename> — true if file ends with .path or .policy
is_metadata() {
    local name="$1"
    [[ "$name" == *.path ]] || [[ "$name" == *.policy ]]
}

# ---------------------------------------------------------------------------
# deploy_file — core logic for a single file triplet
# ---------------------------------------------------------------------------
deploy_file() {
    local source_file="$1"
    local file_name
    file_name="$(basename "$source_file")"

    local path_file="${source_file}.path"
    local policy_file="${source_file}.policy"

    # --- Read .path metadata ---
    if [[ ! -f "$path_file" ]]; then
        log_error "Missing .path file for '${file_name}' — skipping."
        (( FILES_ERRORED++ )) || true
        return 0
    fi

    local target_dir
    target_dir="$(head -n 1 "$path_file" | tr -d '[:space:]')"

    if [[ -z "$target_dir" ]]; then
        log_error "Empty .path file for '${file_name}' — skipping."
        (( FILES_ERRORED++ )) || true
        return 0
    fi

    # --- Read .policy metadata (default: "default") ---
    local policy="default"
    if [[ -f "$policy_file" ]]; then
        policy="$(head -n 1 "$policy_file" | tr -d '[:space:]')"
    else
        log_warn "Missing .policy file for '${file_name}' — defaulting to 'default'."
    fi

    # Validate policy value
    case "$policy" in
        replace|default|backup) ;;
        *)
            log_error "Invalid policy '${policy}' for '${file_name}' — skipping."
            (( FILES_ERRORED++ )) || true
            return 0
            ;;
    esac

    local target_file="${target_dir}/${file_name}"

    # --- Ensure target directory exists ---
    if [[ ! -d "$target_dir" ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            log_info "[DRY-RUN] Would create directory: $target_dir"
        else
            if ! mkdir -p "$target_dir" 2>/dev/null; then
                log_error "Cannot create target directory '${target_dir}' for '${file_name}' — skipping."
                (( FILES_ERRORED++ )) || true
                return 0
            fi
        fi
    fi

    # --- Check if target directory is writable ---
    if [[ "$DRY_RUN" == false ]] && [[ ! -w "$target_dir" ]]; then
        log_error "Target directory not writable: '${target_dir}' for '${file_name}' — skipping."
        (( FILES_ERRORED++ )) || true
        return 0
    fi

    # --- Checksum comparison (skip if identical) ---
    if [[ -f "$target_file" ]]; then
        local src_hash tgt_hash
        src_hash="$(checksum_file "$source_file")"
        tgt_hash="$(checksum_file "$target_file")"

        if [[ "$src_hash" == "$tgt_hash" ]]; then
            log_info "[skip] '${file_name}' — target is already up to date."
            (( FILES_SKIPPED++ )) || true
            return 0
        fi
    fi

    # --- Apply policy ---
    case "$policy" in
        replace)
            if [[ -f "$target_file" ]]; then
                if [[ "$DRY_RUN" == true ]]; then
                    log_info "[DRY-RUN] Would replace: $target_file"
                else
                    cp "$source_file" "$target_file"
                    log_info "[replace] '${file_name}' -> ${target_file}"
                fi
            else
                if [[ "$DRY_RUN" == true ]]; then
                    log_info "[DRY-RUN] Would copy (new): $target_file"
                else
                    cp "$source_file" "$target_file"
                    log_info "[copy] '${file_name}' -> ${target_file} (new)"
                fi
            fi
            (( FILES_DEPLOYED++ )) || true
            ;;

        default)
            if [[ -f "$target_file" ]]; then
                log_info "[skip] '${file_name}' — target exists, policy is 'default' (preserving user changes)."
                (( FILES_SKIPPED++ )) || true
                return 0
            else
                if [[ "$DRY_RUN" == true ]]; then
                    log_info "[DRY-RUN] Would copy (default): $target_file"
                else
                    cp "$source_file" "$target_file"
                    log_info "[copy] '${file_name}' -> ${target_file} (default)"
                fi
                (( FILES_DEPLOYED++ )) || true
            fi
            ;;

        backup)
            if [[ -f "$target_file" ]]; then
                local timestamp
                timestamp="$(date '+%Y%m%d-%H%M%S')"
                local backup_path="${target_file}.backup-${timestamp}"

                if [[ "$DRY_RUN" == true ]]; then
                    log_info "[DRY-RUN] Would backup: ${target_file} -> ${backup_path}"
                    log_info "[DRY-RUN] Would copy: ${source_file} -> ${target_file}"
                else
                    mv "$target_file" "$backup_path"
                    log_info "[backup] '${file_name}' — existing moved to ${backup_path}"
                    cp "$source_file" "$target_file"
                    log_info "[copy] '${file_name}' -> ${target_file}"
                fi
                (( FILES_BACKED_UP++ )) || true
            else
                if [[ "$DRY_RUN" == true ]]; then
                    log_info "[DRY-RUN] Would copy (backup, no existing): $target_file"
                else
                    cp "$source_file" "$target_file"
                    log_info "[copy] '${file_name}' -> ${target_file} (no existing to backup)"
                fi
            fi
            (( FILES_DEPLOYED++ )) || true
            ;;
    esac

    # --- Set ownership to match target directory owner ---
    if [[ "$DRY_RUN" == false ]] && [[ -f "$target_file" ]]; then
        local dir_owner
        dir_owner="$(owner_of "$target_dir")"
        if [[ -n "$dir_owner" ]]; then
            chown "$dir_owner" "$target_file" 2>/dev/null || \
                log_warn "Could not set ownership of '${target_file}' to ${dir_owner}."
        fi
    fi
}

# ---------------------------------------------------------------------------
# process_files — main entry point
# ---------------------------------------------------------------------------
process_files() {
    local files_dir="${REPO_DIR}/${CONFIG_PATH}/files"

    if [[ ! -d "$files_dir" ]]; then
        log_info "[Phase: Files] No files/ directory found at ${CONFIG_PATH}/files — nothing to process."
        return 0
    fi

    log_info "[Phase: Files] Scanning ${files_dir} ..."

    local found_any=false

    for source_file in "$files_dir"/*; do
        # Skip if glob matched nothing (empty directory)
        [[ -e "$source_file" ]] || continue

        # Skip directories
        [[ -f "$source_file" ]] || continue

        # Skip metadata files (.path / .policy)
        local basename
        basename="$(basename "$source_file")"
        if is_metadata "$basename"; then
            continue
        fi

        found_any=true
        (( FILES_PROCESSED++ )) || true
        deploy_file "$source_file"
    done

    if [[ "$found_any" == false ]]; then
        log_info "[Phase: Files] No configuration files found in files/ directory."
    fi

    # --- Summary ---
    log_info "[Phase: Files] Complete — processed:${FILES_PROCESSED} deployed:${FILES_DEPLOYED} skipped:${FILES_SKIPPED} backed-up:${FILES_BACKED_UP} errors:${FILES_ERRORED}"
}

# ---------------------------------------------------------------------------
# Run if executed directly (not sourced)
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
    # Require REPO_DIR and CONFIG_PATH for standalone execution
    if [[ -z "${REPO_DIR:-}" ]] || [[ -z "${CONFIG_PATH:-}" ]]; then
        echo "Usage: REPO_DIR=/path/to/repo CONFIG_PATH=infra/lxc/container-configs bash $0 [--dry-run]" >&2
        exit 1
    fi
    process_files
fi

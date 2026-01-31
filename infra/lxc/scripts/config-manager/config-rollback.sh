#!/usr/bin/env bash
# =============================================================================
# config-rollback — CLI tool for managing configuration rollbacks
#
# Usage:
#   config-rollback list              List available snapshots
#   config-rollback status            Show current conflict status
#   config-rollback show <snapshot>   Show snapshot details
#   config-rollback restore <name>    Restore to a snapshot
#   config-rollback resolve           Clear conflict marker after manual fix
# =============================================================================
set -euo pipefail

readonly CM_STATE_DIR="/var/lib/config-manager"
readonly CM_LOG_DIR="/var/log/config-manager"
readonly CONFLICT_MARKER="${CM_STATE_DIR}/CONFLICT"
readonly CONFLICT_LOG="${CM_STATE_DIR}/conflicts.log"

# Source snapshot-manager for rollback functions
CM_SCRIPT_DIR="/usr/local/lib/config-manager"
if [ -f "${CM_SCRIPT_DIR}/snapshot-manager.sh" ]; then
  log_info()  { printf '[INFO]  %s\n' "$*"; }
  log_ok()    { printf '[ OK ]  %s\n' "$*"; }
  log_warn()  { printf '[WARN]  %s\n' "$*"; }
  log_error() { printf '[FAIL]  %s\n' "$*" >&2; }
  # shellcheck disable=SC1091
  source "${CM_SCRIPT_DIR}/snapshot-manager.sh"
fi

# Load config
SNAPSHOT_BACKEND="auto"
SNAPSHOT_RETENTION_DAYS="7"
if [ -f "/etc/config-manager/config.env" ]; then
  while IFS='=' read -r k v; do
    k="$(echo "$k" | tr -d '[:space:]')"
    v="$(echo "$v" | sed 's/^["'\'']//' | sed 's/["'\'']$//' | sed 's/#.*//' | sed 's/[[:space:]]*$//')"
    [[ -z "$k" || "$k" == \#* ]] && continue
    case "$k" in
      SNAPSHOT_BACKEND)        SNAPSHOT_BACKEND="$v" ;;
      SNAPSHOT_RETENTION_DAYS) SNAPSHOT_RETENTION_DAYS="$v" ;;
    esac
  done < "/etc/config-manager/config.env"
fi

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
cmd_list() {
  echo "Available snapshots:"
  echo "--------------------"
  snapshot_list
}

cmd_status() {
  if [ -f "$CONFLICT_MARKER" ]; then
    echo "STATUS: CONFLICT DETECTED"
    echo ""
    if [ -f "$CONFLICT_LOG" ]; then
      echo "Conflicting files:"
      echo "------------------"
      cat "$CONFLICT_LOG"
    fi
    echo ""
    echo "Actions:"
    echo "  config-rollback list              — View available snapshots"
    echo "  config-rollback restore <name>    — Restore to a snapshot"
    echo "  config-rollback resolve           — Clear conflict after manual fix"
  else
    echo "STATUS: OK"
    if [ -f "${CM_STATE_DIR}/last-sync" ]; then
      echo "Last successful sync: $(cat "${CM_STATE_DIR}/last-sync")"
    else
      echo "No sync has been performed yet."
    fi
  fi
}

cmd_show() {
  local name="${1:-}"
  if [ -z "$name" ]; then
    echo "Usage: config-rollback show <snapshot-name>"
    exit 1
  fi
  echo "Snapshot: $name"
  echo "---"
  echo "To restore this snapshot, run:"
  echo "  config-rollback restore $name"
}

cmd_restore() {
  local name="${1:-}"
  if [ -z "$name" ]; then
    echo "Usage: config-rollback restore <snapshot-name>"
    exit 1
  fi

  echo "Restoring snapshot: $name"
  echo "This will revert all changes made since the snapshot."
  read -rp "Continue? [y/N] " confirm
  if [[ "${confirm,,}" != "y" ]]; then
    echo "Aborted."
    exit 0
  fi

  snapshot_rollback "$name"
  rm -f "$CONFLICT_MARKER"
  echo ""
  echo "Rollback complete. Conflict marker cleared."
}

cmd_resolve() {
  if [ ! -f "$CONFLICT_MARKER" ]; then
    echo "No active conflict to resolve."
    exit 0
  fi

  echo "Clearing conflict marker."
  echo "Make sure you have manually resolved all conflicting files."
  read -rp "Continue? [y/N] " confirm
  if [[ "${confirm,,}" != "y" ]]; then
    echo "Aborted."
    exit 0
  fi

  rm -f "$CONFLICT_MARKER"
  rm -f "$CONFLICT_LOG"

  # Update checksums to reflect current state
  echo "Updating checksums to reflect current file state..."
  if [ -f /usr/local/bin/config-sync.sh ]; then
    # Source file-manager to get checksums_save
    if [ -f "${CM_SCRIPT_DIR}/file-manager.sh" ]; then
      CM_CHECKSUM_DIR="${CM_STATE_DIR}/checksums"
      CM_STATE_DIR="$CM_STATE_DIR"
      # Load config for CONFIGS_DIR
      REPO_DIR="/opt/config-manager/repo"
      CONFIGS_SUBDIR="infra/lxc/container-configs"
      if [ -f "/etc/config-manager/config.env" ]; then
        while IFS='=' read -r k v; do
          k="$(echo "$k" | tr -d '[:space:]')"
          v="$(echo "$v" | sed 's/^["'\'']//' | sed 's/["'\'']$//' | sed 's/#.*//' | sed 's/[[:space:]]*$//')"
          [[ -z "$k" || "$k" == \#* ]] && continue
          case "$k" in
            REPO_DIR)        REPO_DIR="$v" ;;
            CONFIGS_SUBDIR)  CONFIGS_SUBDIR="$v" ;;
          esac
        done < "/etc/config-manager/config.env"
      fi
      CONFIGS_DIR="${REPO_DIR}/${CONFIGS_SUBDIR}"
      # shellcheck disable=SC1091
      source "${CM_SCRIPT_DIR}/file-manager.sh"
      checksums_save
    fi
  fi

  echo "Conflict resolved. Next boot will sync normally."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
case "${1:-}" in
  list)    cmd_list ;;
  status)  cmd_status ;;
  show)    cmd_show "${2:-}" ;;
  restore) cmd_restore "${2:-}" ;;
  resolve) cmd_resolve ;;
  *)
    echo "config-rollback — LXC Configuration Manager rollback tool"
    echo ""
    echo "Usage:"
    echo "  config-rollback list              List available snapshots"
    echo "  config-rollback status            Show conflict status"
    echo "  config-rollback show <snapshot>   Show snapshot details"
    echo "  config-rollback restore <name>    Restore to snapshot"
    echo "  config-rollback resolve           Clear conflict after manual fix"
    exit 1
    ;;
esac

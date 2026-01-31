#!/usr/bin/env bash
# =============================================================================
# 50-vscode-server.sh — VS Code Server (code-server) + extensions (idempotent)
# =============================================================================
set -euo pipefail

USER_HOME="/home/${CONTAINER_USER}"

# ---------------------------------------------------------------------------
# Install code-server
# ---------------------------------------------------------------------------
if is_installed code-server; then
  log_info "code-server already installed: $(code-server --version 2>/dev/null | head -1)"
else
  log_info "Installing code-server..."
  curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone >/dev/null 2>&1

  # Enable as user service
  mkdir -p "${USER_HOME}/.config/code-server"
  cat > "${USER_HOME}/.config/code-server/config.yaml" <<EOF
bind-addr: 0.0.0.0:8443
auth: none
cert: false
EOF
  chown -R "${CONTAINER_USER}:${CONTAINER_USER}" "${USER_HOME}/.config/code-server"

  log_info "code-server installed."
fi

# ---------------------------------------------------------------------------
# Install extensions
# ---------------------------------------------------------------------------
EXTENSIONS_FILE="${CONFIG_MANAGER_ROOT}/files/vscode-extensions.txt"
if [ -f "$EXTENSIONS_FILE" ]; then
  log_info "Installing VS Code extensions..."
  local code_cmd="code-server"
  if ! is_installed code-server; then
    log_warn "code-server not available — skipping extensions."
  else
    while IFS= read -r ext; do
      ext="$(echo "$ext" | sed 's/#.*//' | tr -d '[:space:]')"
      [ -z "$ext" ] && continue

      if sudo -u "${CONTAINER_USER}" $code_cmd --list-extensions 2>/dev/null | grep -qi "$ext"; then
        continue  # already installed
      fi

      sudo -u "${CONTAINER_USER}" $code_cmd --install-extension "$ext" --force >/dev/null 2>&1 || {
        log_warn "  Failed to install extension: ${ext}"
      }
    done < "$EXTENSIONS_FILE"
    log_info "VS Code extensions installed."
  fi
else
  log_info "No vscode-extensions.txt found — skipping extension install."
fi

log_info "VS Code Server setup complete."

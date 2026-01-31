#!/usr/bin/env bash
# =============================================================================
# 06-dev-tools.sh — Development tools: GitHub CLI, act, PNPM (idempotent)
# =============================================================================
set -euo pipefail

USER_HOME="/home/${CONTAINER_USER}"

# ---------------------------------------------------------------------------
# GitHub CLI
# ---------------------------------------------------------------------------
if is_installed gh; then
  log_info "GitHub CLI already installed: $(gh --version 2>/dev/null | head -1)"
else
  log_info "Installing GitHub CLI..."
  case "$CONTAINER_OS" in
    ubuntu|debian)
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
      chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
      DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gh >/dev/null 2>&1
      ;;
    alpine)
      apk add --quiet github-cli 2>/dev/null || log_warn "gh not available for Alpine"
      ;;
    *)
      log_warn "GitHub CLI: unsupported OS for auto-install."
      ;;
  esac
fi

# ---------------------------------------------------------------------------
# act (run GitHub Actions locally)
# ---------------------------------------------------------------------------
if is_installed act; then
  log_info "act already installed."
else
  log_info "Installing act..."
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64)  arch="x86_64" ;;
    aarch64) arch="arm64"  ;;
    *)       log_warn "act: unsupported arch $arch"; arch="" ;;
  esac

  if [ -n "$arch" ]; then
    wget -qO /tmp/act.tar.gz \
      "https://github.com/nektos/act/releases/latest/download/act_Linux_${arch}.tar.gz" 2>/dev/null
    tar xf /tmp/act.tar.gz -C /usr/local/bin act 2>/dev/null
    rm -f /tmp/act.tar.gz
    log_info "act installed."
  fi
fi

# ---------------------------------------------------------------------------
# PNPM
# ---------------------------------------------------------------------------
if sudo -u "${CONTAINER_USER}" bash -c 'command -v pnpm' >/dev/null 2>&1; then
  log_info "PNPM already installed."
else
  log_info "Installing PNPM..."
  sudo -u "${CONTAINER_USER}" bash -c '
    export NVM_DIR="${HOME}/.nvm"
    [ -s "${NVM_DIR}/nvm.sh" ] && . "${NVM_DIR}/nvm.sh"
    curl -fsSL https://get.pnpm.io/install.sh | sh -
  ' >/dev/null 2>&1 || log_warn "PNPM installation failed."
fi

log_info "Development tools setup complete."

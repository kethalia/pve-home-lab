#!/usr/bin/env bash
# =============================================================================
# 05-shell-setup.sh — Zsh + Oh My Zsh + Powerlevel10k (idempotent)
# =============================================================================
set -euo pipefail

USER_HOME="/home/${CONTAINER_USER}"

# Install zsh if not present
if ! is_installed zsh; then
  log_info "Installing zsh..."
  ensure_installed zsh
fi

# Set zsh as default shell for the user
current_shell="$(getent passwd "${CONTAINER_USER}" | cut -d: -f7)"
if [ "$current_shell" != "/bin/zsh" ] && [ "$current_shell" != "/usr/bin/zsh" ]; then
  log_info "Setting zsh as default shell for ${CONTAINER_USER}..."
  chsh -s "$(command -v zsh)" "${CONTAINER_USER}" 2>/dev/null || true
fi

# Install Oh My Zsh
if [ -d "${USER_HOME}/.oh-my-zsh" ]; then
  log_info "Oh My Zsh already installed."
else
  log_info "Installing Oh My Zsh..."
  sudo -u "${CONTAINER_USER}" bash -c '
    RUNZSH=no CHSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
  ' >/dev/null 2>&1

  # Install Powerlevel10k theme
  if [ ! -d "${USER_HOME}/.oh-my-zsh/custom/themes/powerlevel10k" ]; then
    sudo -u "${CONTAINER_USER}" git clone --depth=1 \
      https://github.com/romkatv/powerlevel10k.git \
      "${USER_HOME}/.oh-my-zsh/custom/themes/powerlevel10k" >/dev/null 2>&1
  fi

  # Install zsh plugins
  plugins_dir="${USER_HOME}/.oh-my-zsh/custom/plugins"
  for plugin in zsh-autosuggestions zsh-syntax-highlighting zsh-completions; do
    if [ ! -d "${plugins_dir}/${plugin}" ]; then
      sudo -u "${CONTAINER_USER}" git clone --quiet \
        "https://github.com/zsh-users/${plugin}.git" \
        "${plugins_dir}/${plugin}" >/dev/null 2>&1
    fi
  done

  log_info "Oh My Zsh + Powerlevel10k + plugins installed."
fi

log_info "Shell setup complete."

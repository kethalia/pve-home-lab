#!/usr/bin/env bash
# =============================================================================
# 01-system-setup.sh — Core system configuration
# =============================================================================
set -euo pipefail

log_info "Configuring system..."

# Locale setup
if [ "$CONTAINER_OS" != "alpine" ]; then
  if ! locale -a 2>/dev/null | grep -q "en_US.utf8"; then
    log_info "  Setting up locale..."
    if is_installed locale-gen; then
      locale-gen en_US.UTF-8 >/dev/null 2>&1 || true
    elif is_installed localedef; then
      localedef -i en_US -c -f UTF-8 en_US.UTF-8 2>/dev/null || true
    fi
  fi
fi

# Timezone — use host timezone if available
if [ -f /etc/timezone ]; then
  log_info "  Timezone: $(cat /etc/timezone)"
elif [ -L /etc/localtime ]; then
  log_info "  Timezone: $(readlink /etc/localtime | sed 's|.*/zoneinfo/||')"
fi

# Create standard directories for the container user
USER_HOME="/home/${CONTAINER_USER}"
for dir in projects bin .config .ssh .local/bin; do
  if [ ! -d "${USER_HOME}/${dir}" ]; then
    mkdir -p "${USER_HOME}/${dir}"
    chown "${CONTAINER_USER}:${CONTAINER_USER}" "${USER_HOME}/${dir}"
  fi
done

log_info "System configuration complete."

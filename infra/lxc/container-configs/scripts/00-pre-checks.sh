#!/usr/bin/env bash
# =============================================================================
# 00-pre-checks.sh — Validate system state before configuration
# =============================================================================
set -euo pipefail

log_info "Running pre-checks..."
log_info "  OS: ${CONTAINER_OS} ${CONTAINER_OS_VERSION}"
log_info "  User: ${CONTAINER_USER}"
log_info "  First run: ${CONFIG_MANAGER_FIRST_RUN}"
log_info "  Arch: $(uname -m)"
log_info "  Kernel: $(uname -r)"

# Verify we're running as root
if [ "$(id -u)" -ne 0 ]; then
  log_error "Pre-checks must run as root."
  exit 1
fi

# Verify network connectivity
if curl -fsSL --max-time 5 https://github.com >/dev/null 2>&1; then
  log_info "  Network: OK"
else
  log_warn "  Network: Limited connectivity — some installations may fail."
fi

# Verify container user exists
if id "${CONTAINER_USER}" >/dev/null 2>&1; then
  log_info "  User ${CONTAINER_USER}: exists"
else
  log_warn "  User ${CONTAINER_USER}: not found — creating..."
  useradd "${CONTAINER_USER}" \
    --create-home \
    --shell=/bin/bash \
    --uid=1000 \
    --user-group 2>/dev/null || true
  echo "${CONTAINER_USER} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/nopasswd
fi

log_info "Pre-checks complete."

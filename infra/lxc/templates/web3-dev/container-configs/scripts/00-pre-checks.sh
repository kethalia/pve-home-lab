#!/usr/bin/env bash
# 00-pre-checks.sh — Verify system state and log environment info
#
# This script runs first and validates that the container environment is
# ready for setup. It logs critical system information and checks for
# minimum requirements.

set -euo pipefail

log_info "=== Running Pre-Flight Checks ==="

# Log environment information
log_info "Environment Variables:"
log_info "  CONFIG_MANAGER_VERSION: ${CONFIG_MANAGER_VERSION:-not set}"
log_info "  CONFIG_MANAGER_ROOT: ${CONFIG_MANAGER_ROOT:-not set}"
log_info "  CONFIG_MANAGER_FIRST_RUN: ${CONFIG_MANAGER_FIRST_RUN:-not set}"
log_info "  CONTAINER_OS: ${CONTAINER_OS:-not set}"
log_info "  CONTAINER_OS_VERSION: ${CONTAINER_OS_VERSION:-not set}"
log_info "  CONTAINER_USER: ${CONTAINER_USER:-not set}"

# Check OS compatibility
log_info "Checking OS compatibility..."
if [[ "${CONTAINER_OS:-}" != "ubuntu" && "${CONTAINER_OS:-}" != "debian" ]]; then
    log_warn "This template is optimized for Ubuntu/Debian. Current OS: ${CONTAINER_OS:-unknown}"
    log_warn "Some features may not work as expected."
else
    log_info "✓ OS compatibility: ${CONTAINER_OS} ${CONTAINER_OS_VERSION}"
fi

# Check system resources
log_info "Checking system resources..."

# Check memory (minimum 2GB recommended for web3 dev)
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_MEM_MB=$((TOTAL_MEM_KB / 1024))
log_info "  Total Memory: ${TOTAL_MEM_MB} MB"

if [[ $TOTAL_MEM_MB -lt 2048 ]]; then
    log_warn "  Memory is below recommended 2GB. Some operations may be slow."
fi

# Check disk space (minimum 10GB recommended)
DISK_AVAIL_GB=$(df -BG / | tail -1 | awk '{print $4}' | sed 's/G//')
log_info "  Available Disk: ${DISK_AVAIL_GB} GB"

if [[ $DISK_AVAIL_GB -lt 10 ]]; then
    log_warn "  Disk space is below recommended 10GB free."
fi

# Check CPU cores
CPU_CORES=$(nproc)
log_info "  CPU Cores: ${CPU_CORES}"

if [[ $CPU_CORES -lt 2 ]]; then
    log_warn "  CPU cores below recommended 2. Consider allocating more cores."
fi

# Check network connectivity
log_info "Checking network connectivity..."
if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then
    log_info "✓ Network connectivity: OK"
else
    log_error "✗ Network connectivity: FAILED"
    log_error "  Internet access is required for package installation."
    exit 1
fi

# Check DNS resolution
if getent hosts github.com >/dev/null 2>&1; then
    log_info "✓ DNS resolution: OK"
else
    log_warn "  DNS resolution may have issues. Retrying..."
    sleep 2
    if getent hosts github.com >/dev/null 2>&1; then
        log_info "✓ DNS resolution: OK (after retry)"
    else
        log_error "✗ DNS resolution: FAILED"
        log_error "  Unable to resolve github.com. Check DNS settings."
        exit 1
    fi
fi

# Verify critical directories exist
log_info "Verifying critical directories..."
REQUIRED_DIRS=(
    "/tmp"
    "/var/log"
    "/opt"
    "/usr/local/bin"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [[ ! -d "$dir" ]]; then
        log_error "✗ Required directory missing: $dir"
        exit 1
    fi
done
log_info "✓ All critical directories exist"

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    log_info "✓ Running as root (required for system setup)"
else
    log_error "✗ Script must be run as root"
    exit 1
fi

# Summary
log_info "=== Pre-Flight Checks Complete ==="
log_info "System is ready for configuration."

if [[ "${CONFIG_MANAGER_FIRST_RUN:-false}" == "true" ]]; then
    log_info "This is the FIRST RUN — full setup will be performed."
else
    log_info "This is a SYNC RUN — only changed configurations will be applied."
fi

#!/usr/bin/env bash
# =============================================================================
# 02-docker-install.sh — Docker CE installation (idempotent)
# =============================================================================
set -euo pipefail

if is_installed docker; then
  log_info "Docker already installed: $(docker --version 2>/dev/null || echo 'unknown')"
  # Ensure the container user is in the docker group
  if ! id -nG "${CONTAINER_USER}" 2>/dev/null | grep -qw docker; then
    usermod -aG docker "${CONTAINER_USER}" 2>/dev/null || true
    log_info "  Added ${CONTAINER_USER} to docker group."
  fi
  # Ensure Docker is enabled
  systemctl enable docker 2>/dev/null || true
  systemctl start docker 2>/dev/null || true
  exit 0
fi

log_info "Installing Docker CE..."

case "$CONTAINER_OS" in
  ubuntu|debian)
    # Add Docker GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/${CONTAINER_OS}/gpg \
      -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    # Add repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${CONTAINER_OS} \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker packages
    DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
      containerd.io \
      docker-ce \
      docker-ce-cli \
      docker-buildx-plugin \
      docker-compose-plugin \
      >/dev/null 2>&1
    ;;
  alpine)
    apk add --quiet docker docker-compose
    rc-update add docker default 2>/dev/null || true
    ;;
  fedora|centos|rocky|alma)
    dnf install -y -q dnf-plugins-core >/dev/null 2>&1
    dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo 2>/dev/null || true
    dnf install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin >/dev/null 2>&1
    ;;
esac

# Create docker-compose symlink
if [ -f /usr/libexec/docker/cli-plugins/docker-compose ]; then
  ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/bin/docker-compose 2>/dev/null || true
fi

# Add user to docker group
groupadd -f docker 2>/dev/null || true
usermod -aG docker "${CONTAINER_USER}" 2>/dev/null || true

# Enable and start Docker
systemctl enable docker 2>/dev/null || true
systemctl start docker 2>/dev/null || true

log_info "Docker installed: $(docker --version 2>/dev/null || echo 'version check failed')"

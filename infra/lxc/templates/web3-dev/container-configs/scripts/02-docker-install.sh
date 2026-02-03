#!/usr/bin/env bash
# 02-docker-install.sh — Install Docker CE with Compose and BuildX
#
# Installs Docker CE, docker-compose-plugin, and docker-buildx-plugin using
# the official Docker installation script. Adds the container user to the
# docker group for passwordless Docker access.

set -euo pipefail

log_info "=== Installing Docker CE ==="

# Check if Docker is already installed
if is_installed docker; then
    DOCKER_VERSION=$(docker --version 2>/dev/null || echo "unknown")
    log_info "Docker is already installed: ${DOCKER_VERSION}"
    
    # Verify docker group membership
    if groups "$CONTAINER_USER" | grep -q docker; then
        log_info "✓ User '$CONTAINER_USER' is already in docker group"
    else
        log_info "Adding '$CONTAINER_USER' to docker group..."
        usermod -aG docker "$CONTAINER_USER"
        log_info "✓ User added to docker group (requires re-login)"
    fi
    
    # Verify Docker service is running
    if systemctl is-active --quiet docker; then
        log_info "✓ Docker service is running"
    else
        log_info "Starting Docker service..."
        systemctl enable docker
        systemctl start docker
        log_info "✓ Docker service started"
    fi
    
    log_info "Docker installation check complete — skipping installation."
    exit 0
fi

log_info "Docker not found. Installing Docker CE..."

# Install dependencies
log_info "Installing prerequisites..."
ensure_installed ca-certificates
ensure_installed curl
ensure_installed gnupg

# Download and run official Docker installation script
log_info "Running official Docker installation script..."
if curl -fsSL https://get.docker.com | sh; then
    log_info "✓ Docker CE installed successfully"
else
    log_error "Failed to install Docker CE"
    exit 1
fi

# Verify Docker installation
if ! is_installed docker; then
    log_error "Docker installation verification failed"
    exit 1
fi

DOCKER_VERSION=$(docker --version)
log_info "Installed: ${DOCKER_VERSION}"

# Check for Compose plugin
if docker compose version >/dev/null 2>&1; then
    COMPOSE_VERSION=$(docker compose version)
    log_info "✓ Docker Compose plugin: ${COMPOSE_VERSION}"
else
    log_warn "Docker Compose plugin not found (may require manual installation)"
fi

# Check for BuildX plugin
if docker buildx version >/dev/null 2>&1; then
    BUILDX_VERSION=$(docker buildx version)
    log_info "✓ Docker BuildX plugin: ${BUILDX_VERSION}"
else
    log_warn "Docker BuildX plugin not found (may require manual installation)"
fi

# Add container user to docker group
log_info "Adding '$CONTAINER_USER' to docker group..."
if usermod -aG docker "$CONTAINER_USER"; then
    log_info "✓ User added to docker group"
    log_info "  Note: User must log out and back in for group changes to take effect"
else
    log_error "Failed to add user to docker group"
    exit 1
fi

# Enable and start Docker service
log_info "Enabling Docker service..."
systemctl enable docker
systemctl start docker

# Verify Docker daemon is running
if systemctl is-active --quiet docker; then
    log_info "✓ Docker daemon is running"
else
    log_error "Docker daemon failed to start"
    systemctl status docker --no-pager
    exit 1
fi

# Test Docker installation
log_info "Testing Docker installation..."
if docker run --rm hello-world >/dev/null 2>&1; then
    log_info "✓ Docker test successful (hello-world container ran)"
else
    log_warn "Docker test failed, but installation may still be functional"
fi

# Configure Docker daemon (optional optimizations)
log_info "Configuring Docker daemon..."
DOCKER_DAEMON_JSON="/etc/docker/daemon.json"

if [[ ! -f "$DOCKER_DAEMON_JSON" ]]; then
    cat > "$DOCKER_DAEMON_JSON" <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF
    log_info "✓ Docker daemon configuration created"
    
    # Restart Docker to apply configuration
    systemctl restart docker
    log_info "✓ Docker daemon restarted with new configuration"
else
    log_info "Docker daemon configuration already exists — skipping"
fi

log_info "=== Docker CE Installation Complete ==="
log_info "Docker version: ${DOCKER_VERSION}"
log_info "User '$CONTAINER_USER' can use Docker after re-login or container restart"

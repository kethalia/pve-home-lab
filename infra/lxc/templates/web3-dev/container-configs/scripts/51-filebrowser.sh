#!/usr/bin/env bash
# 51-filebrowser.sh — Install FileBrowser (web-based file manager)
#
# Installs and configures filebrowser with:
# - Admin user with random secure password
# - Root directory set to container user's home
# - Web interface on port 8081
#
# Credentials stored in /etc/infrahaus/credentials

set -eo pipefail

log_info "=== Installing FileBrowser (Web File Manager) ==="

# ============================================================================
# filebrowser (Web-based file manager)
# ============================================================================

install_filebrowser() {
    log_info "Installing filebrowser (web-based file manager)..."
    
    # Check if filebrowser is already installed
    if is_installed filebrowser; then
        FILEBROWSER_VERSION=$(filebrowser version 2>/dev/null || echo "unknown")
        log_info "filebrowser is already installed: ${FILEBROWSER_VERSION}"
        
        # Verify service is running
        if systemctl is-active filebrowser >/dev/null 2>&1; then
            log_info "✓ filebrowser service is running"
        else
            log_info "Starting filebrowser service..."
            systemctl start filebrowser
        fi
        
        return 0
    fi
    
    # Download and install filebrowser
    log_info "Downloading filebrowser installer..."
    curl -fsSL https://raw.githubusercontent.com/filebrowser/get/master/get.sh | bash
    
    # Verify installation
    if ! is_installed filebrowser; then
        log_error "filebrowser installation verification failed"
        return 1
    fi
    
    log_info "✓ filebrowser installed"
    
    # Create filebrowser config
    log_info "Creating filebrowser configuration..."
    mkdir -p /etc/filebrowser
    
    cat > /etc/filebrowser/config.json <<EOF
{
  "port": 8081,
  "baseURL": "",
  "address": "0.0.0.0",
  "log": "stdout",
  "database": "/etc/filebrowser/filebrowser.db",
  "root": "/home/${CONTAINER_USER}"
}
EOF
    
    # Create systemd service
    cat > /etc/systemd/system/filebrowser.service <<'EOF'
[Unit]
Description=File Browser
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/filebrowser -c /etc/filebrowser/config.json
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF
    
    # Generate random password (16 chars to meet filebrowser minimum)
    log_info "Generating secure password for filebrowser..."
    FILEBROWSER_USERNAME="admin"
    FILEBROWSER_PASSWORD=$(generate_password 16)
    save_credential "FILEBROWSER_USERNAME" "$FILEBROWSER_USERNAME"
    save_credential "FILEBROWSER_PASSWORD" "$FILEBROWSER_PASSWORD"
    
    # Initialize database and set admin user
    log_info "Initializing filebrowser database..."
    filebrowser -d /etc/filebrowser/filebrowser.db config init
    filebrowser -d /etc/filebrowser/filebrowser.db users add "$FILEBROWSER_USERNAME" "$FILEBROWSER_PASSWORD" --perm.admin
    
    systemctl daemon-reload
    systemctl enable filebrowser
    systemctl start filebrowser
    
    log_info "✓ filebrowser installed and running on port 8081"
}

# ============================================================================
# Main installation
# ============================================================================

if install_filebrowser; then
    log_info "✓ FileBrowser installation complete"
else
    log_error "FileBrowser installation failed"
    exit 1
fi

log_info "=== FileBrowser Installation Complete ==="

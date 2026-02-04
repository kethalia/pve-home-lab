#!/usr/bin/env bash
# 52-opencode.sh — Install OpenCode (alternative web-based code editor)
#
# Installs and configures opencode with:
# - User-scoped installation
# - Random secure password
# - Web interface on port 8082
#
# Credentials stored in /etc/infrahaus/credentials
# Note: OpenCode is optional - failure will not halt container setup

set -eo pipefail

log_info "=== Installing OpenCode (Alternative Web Editor) ==="

# ============================================================================
# opencode (Alternative web-based code editor)
# ============================================================================

install_opencode() {
    log_info "Installing opencode (web-based code editor)..."
    
    # Check if opencode is already installed
    if run_as_user bash -c "command -v opencode" >/dev/null 2>&1; then
        log_info "opencode is already installed"
        
        # Verify service is running
        if systemctl is-active opencode@"$CONTAINER_USER" >/dev/null 2>&1; then
            log_info "✓ opencode service is running"
        else
            log_info "Starting opencode service..."
            systemctl start opencode@"$CONTAINER_USER"
        fi
        
        return 0
    fi
    
    # Install opencode via official installer
    log_info "Downloading opencode installer..."
    
    # Run as the container user
    run_as_user bash -c "
        curl -fsSL https://opencode.ai/install | bash
    "
    
    # Add opencode to PATH
    OPENCODE_PATH="/home/${CONTAINER_USER}/.opencode/bin"
    
    # Verify installation
    if [[ ! -d "$OPENCODE_PATH" ]] || ! run_as_user bash -c "export PATH='$OPENCODE_PATH:\$PATH' && command -v opencode" >/dev/null 2>&1; then
        log_warn "opencode installation verification failed (may need manual intervention)"
        log_warn "opencode is optional - continuing with setup"
        return 1
    fi
    
    log_info "✓ opencode installed to: ${OPENCODE_PATH}"
    
    # Generate random password
    log_info "Generating secure password for opencode..."
    OPENCODE_PASSWORD=$(generate_password 16)
    save_credential "OPENCODE_PASSWORD" "$OPENCODE_PASSWORD"
    
    # Create systemd service for opencode
    log_info "Creating systemd service for opencode..."
    cat > /etc/systemd/system/opencode@.service <<EOF
[Unit]
Description=OpenCode Web Editor
After=network.target

[Service]
Type=simple
ExecStart=/home/%i/.opencode/bin/opencode web --port 8082 --hostname 0.0.0.0
Restart=always
User=%i
WorkingDirectory=/home/%i
Environment="PATH=/home/%i/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="OPENCODE_SERVER_PASSWORD=${OPENCODE_PASSWORD}"

[Install]
WantedBy=default.target
EOF
    
    systemctl daemon-reload
    systemctl enable opencode@"$CONTAINER_USER"
    systemctl start opencode@"$CONTAINER_USER"
    
    # Wait for service to start
    sleep 3
    
    if systemctl is-active opencode@"$CONTAINER_USER" >/dev/null 2>&1; then
        log_info "✓ opencode installed and running on port 8082"
    else
        log_warn "opencode service may not have started correctly"
        log_warn "Check logs: journalctl -u opencode@$CONTAINER_USER"
    fi
}

# ============================================================================
# Main installation
# ============================================================================

if install_opencode; then
    log_info "✓ OpenCode installation complete"
else
    log_warn "OpenCode installation failed (optional - continuing)"
fi

log_info "=== OpenCode Installation Complete ==="

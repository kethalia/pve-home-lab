#!/usr/bin/env bash
# 50-vscode-server.sh — Install browser-based development tools
#
# Installs and configures:
# - code-server: VS Code in the browser with extensions
# - filebrowser: Web-based file manager
#
# Services are exposed on:
# - code-server: port 8080 (password: coder)
# - filebrowser: port 8081 (admin/coder)

set -euo pipefail

log_info "=== Installing Browser-Based Development Tools ==="

# ============================================================================
# code-server (VS Code in browser)
# ============================================================================

install_code_server() {
    log_info "Installing code-server (VS Code in browser)..."
    
    # Check if code-server is already installed
    if is_installed code-server; then
        CODE_SERVER_VERSION=$(code-server --version 2>/dev/null | head -1 || echo "unknown")
        log_info "code-server is already installed: ${CODE_SERVER_VERSION}"
        
        # Verify systemd service exists and is enabled
        if systemctl is-enabled code-server@"$CONTAINER_USER" >/dev/null 2>&1; then
            log_info "✓ code-server service is enabled"
            
            if systemctl is-active code-server@"$CONTAINER_USER" >/dev/null 2>&1; then
                log_info "✓ code-server service is running"
            else
                log_info "Starting code-server service..."
                systemctl start code-server@"$CONTAINER_USER"
            fi
        else
            log_info "Enabling and starting code-server service..."
            systemctl enable code-server@"$CONTAINER_USER"
            systemctl start code-server@"$CONTAINER_USER"
        fi
        
        return 0
    fi
    
    # Install code-server using official installation script
    log_info "Running official code-server installation script..."
    curl -fsSL https://code-server.dev/install.sh | sh -s -- --version 4.20.0
    
    # Verify installation
    if ! is_installed code-server; then
        log_error "code-server installation verification failed"
        return 1
    fi
    
    CODE_SERVER_VERSION=$(code-server --version | head -1)
    log_info "✓ code-server installed: ${CODE_SERVER_VERSION}"
    
    # Create systemd service for code-server
    log_info "Creating systemd service for code-server..."
    cat > /etc/systemd/system/code-server@.service <<'EOF'
[Unit]
Description=code-server
After=network.target

[Service]
Type=exec
ExecStart=/usr/bin/code-server --bind-addr 0.0.0.0:8080 --auth password
Restart=always
User=%i
Environment=PASSWORD=coder

[Install]
WantedBy=default.target
EOF
    
    systemctl daemon-reload
    systemctl enable code-server@"$CONTAINER_USER"
    systemctl start code-server@"$CONTAINER_USER"
    
    log_info "✓ code-server installed and running on port 8080 (password: coder)"
}

# ============================================================================
# VS Code Extensions
# ============================================================================

install_vscode_extensions() {
    log_info "Installing VS Code extensions for code-server..."
    
    # Wait for code-server to be fully started
    sleep 5
    
    # List of extensions from the original web-tools.custom
    EXTENSIONS=(
        "binary-ink.dark-modern-oled-theme-set"
        "pkief.material-icon-theme"
        "prisma.prisma"
        "graphql.vscode-graphql"
        "graphql.vscode-graphql-syntax"
        "bradlc.vscode-tailwindcss"
        "tintinweb.vscode-solidity-language"
        "nomicfoundation.hardhat-solidity"
        "esbenp.prettier-vscode"
        "eamodio.gitlens"
        "oderwat.indent-rainbow"
        "gruntfuggly.todo-tree"
        "pflannery.vscode-versionlens"
        "ms-vsliveshare.vsliveshare"
        "hashicorp.terraform"
        "ms-azuretools.vscode-docker"
        "cweijan.vscode-postgresql-client2"
        "usernamehw.errorlens"
        "streetsidesoftware.code-spell-checker"
        "wayou.vscode-todo-highlight"
    )
    
    log_info "Installing ${#EXTENSIONS[@]} extensions..."
    
    INSTALLED=0
    FAILED=0
    
    for extension in "${EXTENSIONS[@]}"; do
        log_info "  Installing: ${extension}"
        if run_as_user /usr/bin/code-server --install-extension "$extension" >/dev/null 2>&1; then
            ((INSTALLED++))
        else
            log_warn "  Failed to install: ${extension}"
            ((FAILED++))
        fi
    done
    
    log_info "✓ VS Code extensions installed: ${INSTALLED} succeeded, ${FAILED} failed"
}

# ============================================================================
# VS Code Settings
# ============================================================================

configure_vscode_settings() {
    log_info "Configuring VS Code settings..."
    
    SETTINGS_DIR="/home/${CONTAINER_USER}/.local/share/code-server/User"
    SETTINGS_FILE="${SETTINGS_DIR}/settings.json"
    
    run_as_user mkdir -p "$SETTINGS_DIR"
    
    # Create settings.json with configuration from web-tools.custom
    cat > "$SETTINGS_FILE" <<'EOF'
{
    "[solidity]": {
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "editor.formatOnSave": true
    },
    "solidity.telemetry": false,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.fontFamily": "Fira Code",
    "editor.fontLigatures": true,
    "editor.formatOnSave": true,
    "editor.wordWrap": "on",
    "editor.inlineSuggest.enabled": true,
    "editor.bracketPairColorization.enabled": true,
    "editor.guides.bracketPairs": true,
    "editor.minimap.enabled": false,
    "editor.stickyScroll.enabled": true,
    "editor.tabSize": 2,
    "files.autoSave": "off",
    "files.watcherExclude": {
        "**/.git/objects/**": true,
        "**/.git/subtree-cache/**": true,
        "**/node_modules/**": true,
        "**/.hg/store/**": true,
        "**/dist/**": true,
        "**/build/**": true,
        "**/.next/**": true,
        "**/out/**": true
    },
    "git.confirmSync": false,
    "git.autofetch": true,
    "git.enableSmartCommit": true,
    "terminal.integrated.scrollback": 10000,
    "terminal.integrated.defaultProfile.linux": "bash",
    "terminal.integrated.fontSize": 14,
    "workbench.colorTheme": "Dark Modern (OLED Black) [Orange]",
    "workbench.iconTheme": "material-icon-theme",
    "explorer.confirmDelete": false,
    "explorer.confirmDragAndDrop": false,
    "docker.showStartPage": false
}
EOF
    
    chown -R "$CONTAINER_USER":"$CONTAINER_USER" "/home/${CONTAINER_USER}/.local/share/code-server"
    
    log_info "✓ VS Code settings configured (matching Coder template)"
}

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
    
    # Initialize database and set admin user
    log_info "Initializing filebrowser database..."
    filebrowser -d /etc/filebrowser/filebrowser.db config init
    filebrowser -d /etc/filebrowser/filebrowser.db users add admin coder --perm.admin
    
    systemctl daemon-reload
    systemctl enable filebrowser
    systemctl start filebrowser
    
    log_info "✓ filebrowser installed and running on port 8081 (admin/coder)"
}

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
        curl -fsSL https://opencode.ai/install | sh
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
    
    # Create systemd service for opencode
    log_info "Creating systemd service for opencode..."
    cat > /etc/systemd/system/opencode@.service <<'EOF'
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
Environment="OPENCODE_SERVER_PASSWORD=coder"

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

# Install code-server
if install_code_server; then
    log_info "✓ code-server installation complete"
else
    log_error "code-server installation failed"
    exit 1
fi

# Install VS Code extensions
if install_vscode_extensions; then
    log_info "✓ VS Code extensions installation complete"
else
    log_warn "VS Code extensions installation had issues (check logs)"
fi

# Configure VS Code settings
if configure_vscode_settings; then
    log_info "✓ VS Code settings configuration complete"
else
    log_error "VS Code settings configuration failed"
fi

# Install filebrowser
if install_filebrowser; then
    log_info "✓ filebrowser installation complete"
else
    log_error "filebrowser installation failed"
fi

# Install opencode
if install_opencode; then
    log_info "✓ opencode installation complete"
else
    log_warn "opencode installation failed (optional - continuing)"
fi

# ============================================================================
# Summary
# ============================================================================

log_info "=== Web Tools Installation Complete ==="
log_info ""
log_info "Access URLs (replace <container-ip> with your container's IP):"
log_info "  - VS Code:      http://<container-ip>:8080  (password: coder)"
log_info "  - FileBrowser:  http://<container-ip>:8081  (admin/coder)"
log_info "  - OpenCode:     http://<container-ip>:8082"
log_info ""
log_info "All services are running and will start automatically on boot."

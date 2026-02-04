#!/usr/bin/env bash
# 06-dev-tools.sh — Install development CLI tools
#
# Installs essential development command-line tools:
# - GitHub CLI (gh): Official GitHub command-line tool
# - act: Run GitHub Actions locally for testing
# - pnpm: Fast, disk space efficient package manager for Node.js

set -euo pipefail

log_info "=== Installing Development CLI Tools ==="

# ============================================================================
# GitHub CLI (gh)
# ============================================================================

install_github_cli() {
    log_info "Installing GitHub CLI (gh)..."
    
    # Check if already installed
    if is_installed gh; then
        GH_VERSION=$(gh --version 2>/dev/null | head -1 || echo "unknown")
        log_info "GitHub CLI is already installed: ${GH_VERSION}"
        return 0
    fi
    
    # Add GitHub CLI apt repository (Debian/Ubuntu)
    if [[ "${CONTAINER_OS:-}" == "ubuntu" || "${CONTAINER_OS:-}" == "debian" ]]; then
        log_info "Adding GitHub CLI apt repository..."
        
        # Download and add GPG key
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
            dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        
        # Add repository
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
            tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        
        # Update package index
        apt-get update -qq
        
        # Install gh
        apt-get install -y gh
        
        GH_VERSION=$(gh --version | head -1)
        log_info "✓ GitHub CLI installed: ${GH_VERSION}"
    else
        log_warn "GitHub CLI installation is only automated for Ubuntu/Debian"
        log_warn "Please install manually: https://github.com/cli/cli#installation"
        return 1
    fi
}

# ============================================================================
# act (Run GitHub Actions locally)
# ============================================================================

install_act() {
    log_info "Installing act (GitHub Actions locally)..."
    
    # Check if already installed
    if is_installed act; then
        ACT_VERSION=$(act --version 2>/dev/null || echo "unknown")
        log_info "act is already installed: ${ACT_VERSION}"
        return 0
    fi
    
    # Download and run the official act installer
    log_info "Downloading act installer..."
    
    if curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | bash; then
        log_info "✓ act installed successfully"
        
        if is_installed act; then
            ACT_VERSION=$(act --version)
            log_info "✓ act version: ${ACT_VERSION}"
        fi
    else
        log_error "Failed to install act"
        return 1
    fi
}

# ============================================================================
# pnpm (Fast package manager)
# ============================================================================

install_pnpm() {
    log_info "Installing pnpm (Node.js package manager)..."
    
    # Check if pnpm is already installed
    if run_as_user bash -c "command -v pnpm" >/dev/null 2>&1; then
        PNPM_VERSION=$(run_as_user bash -c "pnpm --version" 2>/dev/null || echo "unknown")
        log_info "pnpm is already installed: v${PNPM_VERSION}"
        return 0
    fi
    
    # Check if npm is available
    if ! run_as_user bash -c "command -v npm" >/dev/null 2>&1; then
        log_error "npm is not available. Cannot install pnpm."
        log_error "Please ensure Node.js is installed first (03-nodejs-setup.sh)"
        return 1
    fi
    
    # Install pnpm globally via npm
    log_info "Installing pnpm globally via npm..."
    
    run_as_user bash -c "
        export NVM_DIR='/home/${CONTAINER_USER}/.nvm'
        if [[ -s \"\$NVM_DIR/nvm.sh\" ]]; then
            source \"\$NVM_DIR/nvm.sh\"
        fi
        npm install -g pnpm
    "
    
    # Verify installation
    if run_as_user bash -c "
        export NVM_DIR='/home/${CONTAINER_USER}/.nvm'
        if [[ -s \"\$NVM_DIR/nvm.sh\" ]]; then
            source \"\$NVM_DIR/nvm.sh\"
        fi
        command -v pnpm
    " >/dev/null 2>&1; then
        PNPM_VERSION=$(run_as_user bash -c "
            export NVM_DIR='/home/${CONTAINER_USER}/.nvm'
            if [[ -s \"\$NVM_DIR/nvm.sh\" ]]; then
                source \"\$NVM_DIR/nvm.sh\"
            fi
            pnpm --version
        ")
        log_info "✓ pnpm installed: v${PNPM_VERSION}"
    else
        log_error "pnpm installation verification failed"
        return 1
    fi
}

# ============================================================================
# Main installation
# ============================================================================

# Install each tool (continue on failure to install as many as possible)
TOOLS_INSTALLED=0
TOOLS_FAILED=0

if install_github_cli; then
    ((TOOLS_INSTALLED++))
else
    ((TOOLS_FAILED++))
fi

if install_act; then
    ((TOOLS_INSTALLED++))
else
    ((TOOLS_FAILED++))
fi

if install_pnpm; then
    ((TOOLS_INSTALLED++))
else
    ((TOOLS_FAILED++))
fi

# Summary
log_info "=== Development Tools Installation Summary ==="
log_info "Tools installed: ${TOOLS_INSTALLED}"
log_info "Tools failed: ${TOOLS_FAILED}"

if [[ $TOOLS_FAILED -gt 0 ]]; then
    log_warn "Some tools failed to install. Check logs above for details."
    exit 1
fi

log_info "=== All Development Tools Installed Successfully ==="

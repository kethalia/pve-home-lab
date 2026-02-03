#!/usr/bin/env bash
# 03-nodejs-setup.sh — Install NVM and Node.js 24 LTS
#
# Installs Node Version Manager (NVM) for the container user and uses it to
# install Node.js 24 (latest LTS) as the default Node version. Configures
# shell environment to make Node available.

set -euo pipefail

log_info "=== Setting up Node.js Environment ==="

# Configuration
NVM_VERSION="v0.40.3"
NVM_DIR="/home/${CONTAINER_USER}/.nvm"
NODE_VERSION="24"

# Check if Node is already installed
if sudo -u "$CONTAINER_USER" bash -c "command -v node" >/dev/null 2>&1; then
    EXISTING_NODE_VERSION=$(sudo -u "$CONTAINER_USER" bash -c "node --version" 2>/dev/null || echo "unknown")
    log_info "Node.js is already installed: ${EXISTING_NODE_VERSION}"
    
    # Check if it's managed by NVM
    if [[ -d "$NVM_DIR" ]]; then
        log_info "NVM is already installed at: ${NVM_DIR}"
        
        # Check if Node 24 is installed via NVM
        if sudo -u "$CONTAINER_USER" bash -c "source ${NVM_DIR}/nvm.sh && nvm ls ${NODE_VERSION}" >/dev/null 2>&1; then
            log_info "✓ Node.js ${NODE_VERSION} is installed via NVM"
            
            # Ensure Node 24 is the default
            sudo -u "$CONTAINER_USER" bash -c "source ${NVM_DIR}/nvm.sh && nvm alias default ${NODE_VERSION}"
            log_info "✓ Node.js ${NODE_VERSION} set as default"
            
            log_info "Node.js setup is complete — skipping installation."
            exit 0
        else
            log_info "Installing Node.js ${NODE_VERSION} via NVM..."
            sudo -u "$CONTAINER_USER" bash -c "source ${NVM_DIR}/nvm.sh && nvm install ${NODE_VERSION} && nvm alias default ${NODE_VERSION}"
            log_info "✓ Node.js ${NODE_VERSION} installed and set as default"
            exit 0
        fi
    else
        log_info "Node.js is installed but not via NVM. Will install NVM for version management."
    fi
fi

log_info "Installing NVM (Node Version Manager)..."

# Download and install NVM for the container user
log_info "Downloading NVM ${NVM_VERSION}..."
sudo -u "$CONTAINER_USER" bash -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash"

# Verify NVM installation
if [[ ! -d "$NVM_DIR" ]]; then
    log_error "NVM installation failed: ${NVM_DIR} not found"
    exit 1
fi

log_info "✓ NVM installed to: ${NVM_DIR}"

# Install Node.js via NVM
log_info "Installing Node.js ${NODE_VERSION} via NVM..."
sudo -u "$CONTAINER_USER" bash -c "
    export NVM_DIR='${NVM_DIR}'
    source \"\${NVM_DIR}/nvm.sh\"
    nvm install ${NODE_VERSION}
    nvm alias default ${NODE_VERSION}
    nvm use default
"

# Verify Node installation
NODE_VERSION_INSTALLED=$(sudo -u "$CONTAINER_USER" bash -c "
    export NVM_DIR='${NVM_DIR}'
    source \"\${NVM_DIR}/nvm.sh\"
    node --version
")

if [[ -z "$NODE_VERSION_INSTALLED" ]]; then
    log_error "Node.js installation verification failed"
    exit 1
fi

log_info "✓ Node.js installed: ${NODE_VERSION_INSTALLED}"

# Verify npm installation
NPM_VERSION=$(sudo -u "$CONTAINER_USER" bash -c "
    export NVM_DIR='${NVM_DIR}'
    source \"\${NVM_DIR}/nvm.sh\"
    npm --version
")

log_info "✓ npm installed: v${NPM_VERSION}"

# Configure npm global directory (avoid permission issues)
log_info "Configuring npm global directory..."
NPM_GLOBAL_DIR="/home/${CONTAINER_USER}/.npm-global"

sudo -u "$CONTAINER_USER" bash -c "
    export NVM_DIR='${NVM_DIR}'
    source \"\${NVM_DIR}/nvm.sh\"
    mkdir -p ${NPM_GLOBAL_DIR}
    npm config set prefix '${NPM_GLOBAL_DIR}'
"

log_info "✓ npm global directory set to: ${NPM_GLOBAL_DIR}"

# Ensure NVM is sourced in .bashrc (if not already present)
BASHRC="/home/${CONTAINER_USER}/.bashrc"
NVM_BASHRC_SNIPPET='
# NVM (Node Version Manager)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
'

if [[ -f "$BASHRC" ]]; then
    if ! grep -q "NVM_DIR" "$BASHRC"; then
        log_info "Adding NVM initialization to .bashrc..."
        sudo -u "$CONTAINER_USER" bash -c "echo '$NVM_BASHRC_SNIPPET' >> $BASHRC"
        log_info "✓ NVM initialization added to .bashrc"
    else
        log_info "NVM initialization already present in .bashrc"
    fi
else
    log_warn ".bashrc not found for user '$CONTAINER_USER'"
fi

# Ensure npm global binaries are in PATH
NPM_PATH_SNIPPET='
# NPM global binaries
export PATH="$HOME/.npm-global/bin:$PATH"
'

if [[ -f "$BASHRC" ]]; then
    if ! grep -q ".npm-global/bin" "$BASHRC"; then
        log_info "Adding npm global path to .bashrc..."
        sudo -u "$CONTAINER_USER" bash -c "echo '$NPM_PATH_SNIPPET' >> $BASHRC"
        log_info "✓ npm global path added to .bashrc"
    else
        log_info "npm global path already present in .bashrc"
    fi
fi

log_info "=== Node.js Setup Complete ==="
log_info "Node.js: ${NODE_VERSION_INSTALLED}"
log_info "npm: v${NPM_VERSION}"
log_info "NVM directory: ${NVM_DIR}"
log_info "npm global directory: ${NPM_GLOBAL_DIR}"
log_info ""
log_info "Note: User '$CONTAINER_USER' must restart shell or run 'source ~/.bashrc' to use Node"

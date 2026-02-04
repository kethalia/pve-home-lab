#!/usr/bin/env bash
# 04-web3-tools.sh — Install Foundry (Ethereum development toolkit)
#
# Installs Foundry, which includes forge, cast, anvil, and chisel.
# Foundry is the most popular Ethereum smart contract development framework.

set -euo pipefail

log_info "=== Installing Web3 Development Tools ==="

# Configuration
FOUNDRY_DIR="/home/${CONTAINER_USER}/.foundry"

# Check if Foundry is already installed
if run_as_user bash -c "command -v forge" >/dev/null 2>&1; then
    FORGE_VERSION=$(run_as_user bash -c "forge --version" 2>/dev/null | head -1 || echo "unknown")
    log_info "Foundry is already installed: ${FORGE_VERSION}"
    log_info "✓ Foundry tools available: forge, cast, anvil, chisel"
    
    # Optionally update Foundry
    log_info "Checking for Foundry updates..."
    if run_as_user bash -c "foundryup" >/dev/null 2>&1; then
        FORGE_VERSION_NEW=$(run_as_user bash -c "forge --version" 2>/dev/null | head -1 || echo "unknown")
        if [[ "$FORGE_VERSION" != "$FORGE_VERSION_NEW" ]]; then
            log_info "✓ Foundry updated: ${FORGE_VERSION_NEW}"
        else
            log_info "✓ Foundry is up to date"
        fi
    else
        log_info "✓ Foundry update check skipped (already latest version)"
    fi
    
    exit 0
fi

log_info "Foundry not found. Installing Foundry..."

# Install Foundry using the official foundryup installer
log_info "Downloading and running foundryup installer..."

# Run foundryup as the container user
run_as_user bash -c "
    curl -L https://foundry.paradigm.xyz | bash
"

# Verify foundryup was installed
if [[ ! -f "${FOUNDRY_DIR}/bin/foundryup" ]]; then
    log_error "foundryup installation failed: ${FOUNDRY_DIR}/bin/foundryup not found"
    exit 1
fi

log_info "✓ foundryup installed to: ${FOUNDRY_DIR}"

# Add Foundry to PATH for current session
export PATH="${FOUNDRY_DIR}/bin:$PATH"

# Run foundryup to install Foundry tools
log_info "Running foundryup to install Foundry tools (forge, cast, anvil, chisel)..."
run_as_user bash -c "
    export PATH='${FOUNDRY_DIR}/bin:\$PATH'
    foundryup
"

# Verify Foundry installation
if ! run_as_user bash -c "export PATH='${FOUNDRY_DIR}/bin:\$PATH' && command -v forge" >/dev/null 2>&1; then
    log_error "Foundry installation verification failed: forge not found"
    exit 1
fi

FORGE_VERSION=$(run_as_user bash -c "export PATH='${FOUNDRY_DIR}/bin:\$PATH' && forge --version" | head -1)
log_info "✓ Foundry installed: ${FORGE_VERSION}"

# Verify all Foundry tools
FOUNDRY_TOOLS=("forge" "cast" "anvil" "chisel")
log_info "Verifying Foundry tools..."

for tool in "${FOUNDRY_TOOLS[@]}"; do
    if run_as_user bash -c "export PATH='${FOUNDRY_DIR}/bin:\$PATH' && command -v $tool" >/dev/null 2>&1; then
        log_info "  ✓ $tool"
    else
        log_warn "  ✗ $tool not found"
    fi
done

# Ensure Foundry is in PATH for future sessions
BASHRC="/home/${CONTAINER_USER}/.bashrc"
FOUNDRY_PATH_SNIPPET='
# Foundry
export PATH="$HOME/.foundry/bin:$PATH"
'

if [[ -f "$BASHRC" ]]; then
    if ! grep -q ".foundry/bin" "$BASHRC"; then
        log_info "Adding Foundry to PATH in .bashrc..."
        run_as_user bash -c "echo '$FOUNDRY_PATH_SNIPPET' >> $BASHRC"
        log_info "✓ Foundry PATH added to .bashrc"
    else
        log_info "Foundry PATH already present in .bashrc"
    fi
else
    log_warn ".bashrc not found for user '$CONTAINER_USER'"
fi

log_info "=== Foundry Installation Complete ==="
log_info "Installed tools: forge, cast, anvil, chisel"
log_info "Version: ${FORGE_VERSION}"
log_info "Installation directory: ${FOUNDRY_DIR}"
log_info ""
log_info "Note: User '$CONTAINER_USER' must restart shell or run 'source ~/.bashrc' to use Foundry"

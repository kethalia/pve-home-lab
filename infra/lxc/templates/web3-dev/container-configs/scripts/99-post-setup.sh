#!/usr/bin/env bash
# 99-post-setup.sh — Final validation, cleanup, and welcome message
#
# This script runs last after all other setup scripts have completed.
# It performs final validation checks, cleans up temporary files, and
# displays a welcome message with service URLs and quick start guide.

set -euo pipefail

log_info "=== Running Post-Setup Tasks ==="

# ============================================================================
# Validation Checks
# ============================================================================

log_info "Performing final validation checks..."

# Check critical services
SERVICES_OK=true

# Check Docker
if systemctl is-active --quiet docker; then
    log_info "✓ Docker service is running"
else
    log_warn "✗ Docker service is not running"
    SERVICES_OK=false
fi

# Check code-server
if systemctl is-active --quiet code-server@"${CONTAINER_USER}"; then
    log_info "✓ code-server is running"
else
    log_warn "✗ code-server is not running"
    SERVICES_OK=false
fi

# Check filebrowser
if systemctl is-active --quiet filebrowser; then
    log_info "✓ filebrowser is running"
else
    log_warn "✗ filebrowser is not running"
    SERVICES_OK=false
fi

# Verify critical tools are installed
TOOLS_OK=true

check_tool() {
    local tool=$1
    local user_context=${2:-root}
    
    if [[ "$user_context" == "user" ]]; then
        if sudo -u "$CONTAINER_USER" bash -c "command -v $tool" >/dev/null 2>&1; then
            log_info "✓ $tool is installed (user context)"
        else
            log_warn "✗ $tool is not installed (user context)"
            TOOLS_OK=false
        fi
    else
        if command -v "$tool" >/dev/null 2>&1; then
            log_info "✓ $tool is installed"
        else
            log_warn "✗ $tool is not installed"
            TOOLS_OK=false
        fi
    fi
}

check_tool docker
check_tool node user
check_tool npm user
check_tool pnpm user
check_tool forge user
check_tool gh
check_tool act
check_tool starship

# ============================================================================
# Cleanup
# ============================================================================

log_info "Performing cleanup..."

# Clean package manager caches
if [[ "${CONTAINER_OS:-}" == "ubuntu" || "${CONTAINER_OS:-}" == "debian" ]]; then
    apt-get clean
    log_info "✓ APT cache cleaned"
fi

# Remove temporary files
rm -f /tmp/starship.*.tar.gz 2>/dev/null || true
log_info "✓ Temporary files cleaned"

# ============================================================================
# Display Welcome Message
# ============================================================================

# Get container IP address
CONTAINER_IP=$(hostname -I | awk '{print $1}')

cat << EOF

═══════════════════════════════════════════════════════════
        Web3 Development Container - Ready!
═══════════════════════════════════════════════════════════

👤 User Account:
   Username: coder
   UID: 1000
   Groups: sudo, docker
   Shell: bash with Starship prompt

🌐 Web-Based Development:
   
   VS Code Server:  http://${CONTAINER_IP}:8080
                    Password: coder
                    Extensions: Solidity, Tailwind, Prisma, GitLens,
                               Docker, Terraform, GraphQL, and more
                    
   FileBrowser:     http://${CONTAINER_IP}:8081
                    Username: admin
                    Password: coder
   


🔌 Terminal Access:
   
   SSH:             ssh coder@${CONTAINER_IP}
   Console:         pct enter <container-id>

📦 Development Stack:
   
   ✓ Docker + Docker Compose (Docker-in-Docker enabled)
   ✓ Node.js with npm and pnpm
   ✓ Foundry (forge, cast, anvil, chisel)
   ✓ GitHub CLI (gh) and act
   ✓ Starship prompt for bash

🔧 Configuration Management:
   
   Auto-sync:       Enabled on boot
   Manual sync:     sudo systemctl restart config-manager
   View logs:       journalctl -u config-manager -f
   Rollback:        config-rollback list
   Status:          config-rollback status

💡 Quick Start:
   
   1. Open http://${CONTAINER_IP}:8080 in your browser
   2. Enter password: coder
   3. Open folder: /home/coder/projects
   4. Start coding!

📚 Repository:
   https://github.com/kethalia/pve-home-lab

═══════════════════════════════════════════════════════════

Happy coding! 🚀

═══════════════════════════════════════════════════════════

EOF

# ============================================================================
# Final Status Report
# ============================================================================

log_info "=== Post-Setup Complete ==="

if [[ "$SERVICES_OK" == "true" ]] && [[ "$TOOLS_OK" == "true" ]]; then
    log_info "✓ All services and tools are operational"
    log_info "Container is ready for development!"
else
    log_warn "Some services or tools failed validation (see above)"
    log_warn "Container may not be fully functional"
fi

log_info "Configuration applied successfully at $(date)"

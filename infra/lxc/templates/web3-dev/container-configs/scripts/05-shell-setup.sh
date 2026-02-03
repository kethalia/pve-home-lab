#!/usr/bin/env bash
# 05-shell-setup.sh — Install and configure Starship prompt for bash
#
# Installs the Starship cross-shell prompt and configures it for both the
# container user and root. Starship provides a fast, customizable, and
# minimal prompt with git integration and language version indicators.

set -euo pipefail

log_info "=== Setting up Shell Environment (Starship) ==="

# Check if Starship is already installed
if is_installed starship; then
    STARSHIP_VERSION=$(starship --version 2>/dev/null | head -1 || echo "unknown")
    log_info "Starship is already installed: ${STARSHIP_VERSION}"
    
    # Verify it's configured in bashrc
    if grep -q "starship init bash" "/home/${CONTAINER_USER}/.bashrc" 2>/dev/null; then
        log_info "✓ Starship is configured in user .bashrc"
    else
        log_info "Adding Starship to user .bashrc..."
        sudo -u "$CONTAINER_USER" bash -c 'echo '"'"'eval "$(starship init bash)"'"'"' >> /home/'"$CONTAINER_USER"'/.bashrc'
        log_info "✓ Starship added to user .bashrc"
    fi
    
    if grep -q "starship init bash" "/root/.bashrc" 2>/dev/null; then
        log_info "✓ Starship is configured in root .bashrc"
    else
        log_info "Adding Starship to root .bashrc..."
        echo 'eval "$(starship init bash)"' >> /root/.bashrc
        log_info "✓ Starship added to root .bashrc"
    fi
    
    log_info "Starship setup complete — skipping installation."
    exit 0
fi

log_info "Starship not found. Installing Starship prompt..."

# Download and install Starship binary
STARSHIP_ARCH="x86_64-unknown-linux-gnu"
STARSHIP_TEMP=$(mktemp -t starship.XXXXXX.tar.gz)

log_info "Downloading Starship binary for ${STARSHIP_ARCH}..."
if ! curl -fsSL --max-time 30 -A "ProxmoxVE-Script/1.0" \
    "https://github.com/starship/starship/releases/latest/download/starship-${STARSHIP_ARCH}.tar.gz" \
    -o "${STARSHIP_TEMP}"; then
    log_error "Failed to download Starship binary"
    rm -f "${STARSHIP_TEMP}"
    exit 1
fi

# Extract to /usr/local/bin
log_info "Extracting Starship binary..."
if ! tar -xzf "${STARSHIP_TEMP}" -C /usr/local/bin/; then
    log_error "Failed to extract Starship binary"
    rm -f "${STARSHIP_TEMP}"
    exit 1
fi

rm -f "${STARSHIP_TEMP}"
log_info "✓ Starship binary installed to /usr/local/bin/starship"

# Verify installation
if ! command -v starship >/dev/null 2>&1; then
    log_error "Starship binary not found after installation"
    exit 1
fi

STARSHIP_VERSION=$(starship --version | head -1)
log_info "✓ Starship installed: ${STARSHIP_VERSION}"

# Configure Starship for coder user
log_info "Configuring Starship for user '${CONTAINER_USER}'..."
if [[ -f "/home/${CONTAINER_USER}/.bashrc" ]]; then
    if ! grep -q "starship init bash" "/home/${CONTAINER_USER}/.bashrc"; then
        sudo -u "$CONTAINER_USER" bash -c 'echo '"'"'eval "$(starship init bash)"'"'"' >> /home/'"$CONTAINER_USER"'/.bashrc'
        log_info "✓ Starship initialization added to user .bashrc"
    else
        log_info "Starship initialization already present in user .bashrc"
    fi
else
    log_warn ".bashrc not found for user '$CONTAINER_USER'"
fi

# Configure Starship for root user
log_info "Configuring Starship for root user..."
if [[ -f "/root/.bashrc" ]]; then
    if ! grep -q "starship init bash" "/root/.bashrc"; then
        echo 'eval "$(starship init bash)"' >> /root/.bashrc
        log_info "✓ Starship initialization added to root .bashrc"
    else
        log_info "Starship initialization already present in root .bashrc"
    fi
else
    log_warn ".bashrc not found for root user"
fi

# Create default Starship configuration (optional)
STARSHIP_CONFIG="/home/${CONTAINER_USER}/.config/starship.toml"

if [[ ! -f "$STARSHIP_CONFIG" ]]; then
    log_info "Creating default Starship configuration..."
    
    sudo -u "$CONTAINER_USER" mkdir -p "/home/${CONTAINER_USER}/.config"
    
    sudo -u "$CONTAINER_USER" bash -c "cat > '$STARSHIP_CONFIG'" <<'EOF'
# Starship prompt configuration for Web3 development container
# See https://starship.rs/config/ for full documentation

# Format
format = """
[┌───────────────────>](bold green)
[│](bold green)$username\
$hostname\
$directory\
$git_branch\
$git_status\
$nodejs\
$rust\
$python\
$docker_context
[└─>](bold green) """

# Prompt character
[character]
success_symbol = "[➜](bold green)"
error_symbol = "[➜](bold red)"

# Username
[username]
show_always = true
format = "[$user]($style) "
style_user = "bold yellow"
style_root = "bold red"

# Hostname
[hostname]
ssh_only = false
format = "[@$hostname]($style) "
style = "bold blue"

# Directory
[directory]
truncation_length = 3
truncate_to_repo = true
format = "[$path]($style)[$read_only]($read_only_style) "
style = "bold cyan"

# Git branch
[git_branch]
format = "[$symbol$branch]($style) "
symbol = " "
style = "bold purple"

# Git status
[git_status]
format = '([\[$all_status$ahead_behind\]]($style) )'
style = "bold red"

# Node.js
[nodejs]
format = "[$symbol($version )]($style)"
symbol = " "
style = "bold green"

# Rust
[rust]
format = "[$symbol($version )]($style)"
symbol = " "
style = "bold red"

# Python
[python]
format = '[${symbol}${pyenv_prefix}(${version} )(\($virtualenv\) )]($style)'
symbol = " "
style = "bold yellow"

# Docker
[docker_context]
format = "[$symbol$context]($style) "
symbol = " "
style = "bold blue"
only_with_files = true
EOF

    log_info "✓ Default Starship configuration created at: ${STARSHIP_CONFIG}"
    log_info "  Users can customize it by editing ~/.config/starship.toml"
else
    log_info "Starship configuration already exists: ${STARSHIP_CONFIG}"
fi

log_info "=== Shell Setup Complete ==="
log_info "Starship version: ${STARSHIP_VERSION}"
log_info "Configuration: ${STARSHIP_CONFIG}"
log_info ""
log_info "Note: Users must restart shell or run 'source ~/.bashrc' to see the new prompt"

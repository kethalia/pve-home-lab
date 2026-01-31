# Container Scripts

Shell scripts placed in this directory are executed **sequentially** in
`LC_ALL=C` alphabetical order during every config-manager sync (typically at
boot). Use the numeric-prefix naming convention to control execution order.

## Naming Convention

```
scripts/
├── 00-pre-checks.sh       # Validate system state
├── 01-system-setup.sh     # Core system configuration
├── 02-docker-install.sh   # Docker CE setup
├── 03-nodejs-setup.sh     # Node.js + version manager
├── 04-web3-tools.sh       # Foundry, Solidity tools
├── 05-shell-setup.sh      # Zsh + Oh My Zsh + Powerlevel10k
├── 50-vscode-server.sh    # VS Code Server + extensions
└── 99-post-setup.sh       # Final cleanup and validation
```

Only `*.sh` files are executed; all other files are ignored.

## Environment Variables

Every script has access to the following exported variables:

| Variable | Example | Description |
|----------|---------|-------------|
| `CONFIG_MANAGER_VERSION` | `0.3.0` | Config manager version |
| `CONFIG_MANAGER_ROOT` | `/opt/config-manager/repo` | Path to cloned repository |
| `CONFIG_MANAGER_LOG` | `/var/log/config-manager/sync.log` | Sync log path |
| `CONFIG_MANAGER_FIRST_RUN` | `true` or `false` | Whether this is the first sync |
| `CONTAINER_OS` | `ubuntu` | Detected OS (`ubuntu`, `debian`, `alpine`, `fedora`, ...) |
| `CONTAINER_OS_VERSION` | `24.04` | Detected OS version |
| `CONTAINER_USER` | `coder` | Primary non-root user |

## Helper Functions

These functions are automatically available in every script:

```bash
is_installed <cmd>       # Check if a command exists on PATH
ensure_installed <pkg>   # Install a package if not already present
log_info <msg>           # Log at INFO level
log_warn <msg>           # Log at WARNING level
log_error <msg>          # Log at ERROR level
```

## Writing Idempotent Scripts

Scripts should be safe to re-run. Use guards to avoid repeating work:

```bash
#!/usr/bin/env bash
# 02-docker-install.sh — Install Docker CE

if is_installed docker; then
    log_info "Docker is already installed — skipping."
    exit 0
fi

log_info "Installing Docker CE ..."
curl -fsSL https://get.docker.com | sh

# Add the container user to the docker group
usermod -aG docker "$CONTAINER_USER"

log_info "Docker CE installed successfully."
```

## Error Handling

- A script that exits with a **non-zero** exit code stops the entire chain.
- Subsequent scripts will **not** run.
- The failure is logged and (when implemented) triggers the conflict/rollback
  handler.
- Always use `set -euo pipefail` at the top of your scripts and handle errors
  explicitly where needed.

# LXC Scripts

This directory contains scripts for deploying and managing LXC containers in ProxmoxVE.

## ProxmoxVE Integration Scripts

### `web3-dev-container.sh` - Main ProxmoxVE Script

A ProxmoxVE-compatible LXC container creation script that follows the [community-scripts/ProxmoxVE](https://github.com/community-scripts/ProxmoxVE) pattern.

**Usage:**

```bash
# From ProxmoxVE host shell:
bash -c "$(wget -qLO - https://raw.githubusercontent.com/kethalia/pve-home-lab/main/infra/lxc/scripts/web3-dev-container.sh)"

# Or using curl:
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/pve-home-lab/main/infra/lxc/scripts/web3-dev-container.sh)"
```

**Container Specifications:**

- **Type:** Privileged LXC (for Docker-in-Docker support)
- **OS:** Ubuntu 24.04 LTS
- **CPU:** 4 cores (configurable via `var_cpu`)
- **RAM:** 8192 MB (configurable via `var_ram`)
- **Disk:** 20 GB (configurable via `var_disk`)
- **Features:** Nesting, Keyctl, FUSE enabled
- **Tags:** web3, development, nodejs, docker

**What it creates:**

1. Privileged LXC container with development-friendly settings
2. `coder` user (UID 1000) with sudo NOPASSWD access
3. Bash shell with Starship prompt
4. Git-based configuration management system (auto-sync on boot)
5. SSH access configured via ProxmoxVE standard process

**Post-installation:**

- Development tools (Docker, Node.js, Web3 tools) are installed via git-synced configuration
- Container automatically syncs configuration on every boot
- Manual updates can be triggered via `update_script()` function

### `install/web3-dev-install.sh` - Container Installation Script

The installation script that runs inside the LXC container during initial setup.

**What it installs:**

1. **Base system packages:** curl, git, sudo, wget, build-essential, etc.
2. **User setup:** Creates `coder` user with proper permissions
3. **Starship prompt:** Modern, fast shell prompt for bash
4. **Config-manager service:** Git-based configuration synchronization
5. **First sync:** Automatically runs configuration sync during install

**ProxmoxVE Compliance:**

- Uses all standard ProxmoxVE helper functions (`msg_info`, `msg_ok`, `$STD`)
- Follows ProxmoxVE error handling and logging conventions
- Integrates with ProxmoxVE SSH key management (`motd_ssh`)
- Uses ProxmoxVE container finalization (`customize`, `cleanup_lxc`)

## Configuration Management Integration

The scripts integrate with the config-manager service located in `config-manager/`:

- **Repository:** https://github.com/kethalia/pve-home-lab.git
- **Branch:** main
- **Config Path:** infra/lxc/container-configs
- **Auto-sync:** Enabled on container boot
- **Manual sync:** `sudo systemctl restart config-manager`

## Development Tools Installed

Via git-synced configuration from `container-configs/packages/`:

**System Packages:**

- Docker CE (docker-ce, docker-ce-cli, containerd.io)
- Node.js and npm ecosystem
- Build tools and utilities

**Custom Tools:**

- **Foundry** (forge, cast, anvil, chisel) - Ethereum development
- **GitHub CLI** (gh) - GitHub integration
- **Act** (act) - Local GitHub Actions runner
- **pnpm** - Fast npm package manager

**Package Files:**

- `cli.custom` - CLI development tools
- `node.custom` - Node.js ecosystem tools
- `web3.custom` - Blockchain development tools

## Usage Examples

### Basic Container Creation

```bash
# Run from ProxmoxVE host
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/pve-home-lab/main/infra/lxc/scripts/web3-dev-container.sh)"
```

### Custom Resource Allocation

```bash
# 2 CPU, 4GB RAM, 30GB disk
var_cpu=2 var_ram=4096 var_disk=30 bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/pve-home-lab/main/infra/lxc/scripts/web3-dev-container.sh)"
```

### Container Management

```bash
# SSH into container
ssh coder@<container_ip>

# Check configuration sync status
journalctl -u config-manager

# Manual configuration sync
sudo systemctl restart config-manager

# Check rollback options
config-rollback status
config-rollback list

# View sync logs
cat /var/log/config-manager/sync.log
```

## Update Process

The container can be updated using multiple methods:

### Automatic Updates

- Container syncs configuration on every boot via config-manager service
- Development tools are updated via git-synced packages from repository

### Manual Configuration Sync (Inside Container)

```bash
# Trigger manual configuration sync
sudo systemctl restart config-manager

# Check sync status and logs
journalctl -u config-manager -f

# View sync log file
cat /var/log/config-manager/sync.log

# Check configuration status
config-rollback status

# List available rollback snapshots
config-rollback list
```

### System Updates via ProxmoxVE (From Host)

The `update_script()` function performs system package updates and restarts config-manager.

**Via ProxmoxVE Web UI:**

1. Navigate to your container in the web interface
2. Select the container
3. Click "More" → "Update" (if available in your ProxmoxVE version)

**Via Command Line (from ProxmoxVE host):**

```bash
# Find your container ID (e.g., 100)
pct list | grep "Web3 Dev"

# Enter the container console
pct enter <container_id>

# Inside container, manually run the update commands:
apt update && apt upgrade -y
systemctl restart config-manager
```

**What update_script() does:**

1. Checks container storage and resources
2. Updates base system packages (`apt update && apt upgrade`)
3. Restarts config-manager service to sync latest configuration
4. Validates that config-manager is running properly

**Note:** The ProxmoxVE community-scripts pattern typically invokes `update_script()` through the ProxmoxVE UI "Update" button. The exact invocation method depends on your ProxmoxVE version and configuration.

## Directory Structure

```
infra/lxc/scripts/
├── README.md                           # This documentation
├── web3-dev-container.sh               # Main ProxmoxVE script
├── install/
│   └── web3-dev-install.sh             # Container installation script
└── config-manager/                     # Configuration management system
    ├── install-config-manager.sh       # Service installer
    ├── config-sync.sh                  # Main sync script
    ├── config-manager.service          # Systemd service
    └── ...                             # Other config-manager components
```

## Requirements

- **ProxmoxVE:** 8.x or 9.x
- **Network:** Internet access for downloading packages and git sync
- **Storage:** Sufficient storage pool space for container disk allocation
- **Permissions:** Ability to create privileged containers on ProxmoxVE host

## Troubleshooting

### Container Creation Issues

```bash
# Check ProxmoxVE logs
journalctl -xe

# Verify network connectivity
ping github.com

# Check storage pool space
pvesm status
```

### Configuration Sync Issues

```bash
# Inside container - check service status
systemctl status config-manager

# Check sync logs
journalctl -u config-manager -f

# Check git repository access
git ls-remote https://github.com/kethalia/pve-home-lab.git

# Manual sync
sudo systemctl restart config-manager
```

### Development Tools Not Available

```bash
# Check if tools are installed
docker --version
node --version
forge --version

# If not installed, check package installation logs
cat /var/log/config-manager/sync.log | grep -i error

# Restart container to refresh PATH
# Or source shell profile
source ~/.bashrc
```

## Contributing

When modifying these scripts:

1. **Maintain ProxmoxVE compliance:** Follow the community-scripts patterns
2. **Test syntax:** Run `bash -n script.sh` before committing
3. **Document changes:** Update this README with any new features
4. **Verify integration:** Test config-manager integration with local changes

## Related Issues

- **Issue #46:** ProxmoxVE LXC install script integration (this implementation)
- **Issue #38:** Epic - Git-based LXC Configuration Management
- **Issues #39-#45:** Config-manager service dependencies

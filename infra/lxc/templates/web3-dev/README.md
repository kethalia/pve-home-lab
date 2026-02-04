# Web3 Development Container Template

This template provides a complete ProxmoxVE LXC container setup for Web3 development with Docker-in-Docker support and git-based configuration management.

## Template Contents

This template is completely self-contained:

```
web3-dev/
├── container.sh          # ProxmoxVE container creation script
├── template.conf         # Template metadata and defaults
├── README.md             # This documentation
└── container-configs/    # Web3-specific configuration
    ├── packages/         # Package lists (Docker, Node.js, Web3 tools)
    ├── scripts/          # Boot-time scripts
    └── files/            # Managed configuration files

Note: install.sh is now shared across all templates at:
      infra/lxc/scripts/install-lxc-template.sh
```

## Quick Start

### One-Command Deployment

```bash
# From ProxmoxVE host shell:
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"
```

### Custom Configuration

```bash
# Custom resources (2 CPU, 4GB RAM, 30GB disk)
var_cpu=2 var_ram=4096 var_disk=30 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"

# Custom repository and branch
REPO_URL="https://github.com/myuser/my-fork.git" \
REPO_BRANCH="develop" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"

# Test feature branch (for developers)
SCRIPT_BRANCH="feature/my-changes" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/feature/my-changes/infra/lxc/templates/web3-dev/container.sh)"
```

## Container Specifications

### Default Configuration

- **Type:** Unprivileged LXC (secure by default)
- **OS:** Debian 12 (Bookworm)
- **CPU:** 4 cores
- **RAM:** 8192 MB (8 GB)
- **Disk:** 20 GB
- **Features:** Nesting, Keyctl, FUSE enabled
- **Tags:** web3, development, nodejs, docker
- **User:** `coder` (UID 1000)
- **Exposed Ports:**
  - 8080: VS Code Server (password-protected)
  - 8081: FileBrowser (password-protected)
  - 8082: OpenCode (password-protected)
- **Security:** Random passwords generated on first boot, stored in `/etc/infrahaus/credentials`

### Customizable via Environment Variables

#### Container Resources (`container.sh`)

```bash
var_cpu=<cores>              # Number of CPU cores (default: 4)
var_ram=<megabytes>          # RAM in MB (default: 8192)
var_disk=<gigabytes>         # Disk size in GB (default: 20)
var_os=<os>                  # OS template (default: debian)
var_version=<version>        # OS version (default: 12)
var_unprivileged=<0|1>       # Container mode (default: 1 = unprivileged)
var_nesting=<0|1>            # Enable nesting (default: 1)
var_keyctl=<0|1>             # Enable keyctl (default: 1)
var_fuse=<0|1>               # Enable FUSE (default: 1)
```

#### Configuration Management

```bash
REPO_URL=<git-url>           # Configuration repository (default: this repo)
REPO_BRANCH=<branch>         # Repository branch (default: main)
SCRIPT_BRANCH=<branch>       # Script branch for testing (default: main)

# Note: CONFIG_PATH is automatically set by template.conf
# and points to this template's container-configs directory
```

**Note:** This template includes its own `container-configs/` directory with web3-specific packages. You can customize this template's packages or point to a different config path entirely.

## What Gets Installed

### Base System

1. **Essential packages:** curl, git, sudo, wget, build-essential, vim, unzip
2. **User setup:** Creates `coder` user (UID 1000) with restricted sudo access
3. **Shell enhancement:** Starship prompt for bash
4. **Config management:** Git-based configuration sync service

### Development Tools (via Config-Manager)

Automatically installed from `container-configs/packages/`:

- **Docker CE:** docker-ce, docker-ce-cli, containerd.io, docker-compose-plugin
- **Node.js:** Latest LTS with npm and pnpm
- **Web3 Tools:** Foundry (forge, cast, anvil, chisel)
- **CLI Tools:** GitHub CLI (gh), Act (local GitHub Actions)

### Browser-Based Development Tools

- **code-server:** VS Code in the browser (port 8080)
  - Pre-configured with extensions from Microsoft Marketplace (ESLint, Prettier, Solidity, Copilot, GitLens, Docker, Live Share)
  - Auto-save enabled, format on save
  - Default Dark+ theme
  - Password-protected (random password on first boot)
- **FileBrowser:** Web-based file manager (port 8081)
  - Browse and manage files through browser
  - Upload/download files
  - Edit files directly
  - Password-protected (random password on first boot)
- **OpenCode:** Alternative web-based code editor (port 8082)
  - Lightweight alternative to code-server
  - Modern web-based editing experience
  - Password-protected (random password on first boot)

**Credentials:** All passwords are randomly generated during container setup and stored in `/etc/infrahaus/credentials` (mode 600, root-only). See [Credentials & Security](#credentials--security) section.

## Configuration Management

### Git-Based Sync

The container uses a git-based configuration management system that:

- **Auto-syncs on boot:** Configuration applied every container start
- **Declarative:** All configuration in version-controlled files
- **Rollback capable:** Snapshots with conflict detection
- **Cross-distribution:** Works on Ubuntu, Debian, Alpine, RHEL

### Configuration Structure

This template includes its own configuration in `container-configs/`:

```
web3-dev/container-configs/
├── packages/           # Package installation lists
│   ├── cli.custom     # Custom CLI tools (gh, act)
│   ├── node.custom    # Node.js ecosystem (npm, pnpm)
│   └── web3.custom    # Blockchain tools (Foundry)
├── scripts/           # Boot-time scripts (run alphabetically)
└── files/             # Managed configuration files
```

**Self-Contained:** All web3-specific packages are defined within this template, making it easy to customize or fork.

## Credentials & Security

### Password System

This template implements a secure credential management system:

- **Random Generation:** All passwords are randomly generated (16 characters, A-Za-z0-9) during first boot
- **Secure Storage:** Credentials stored in `/etc/infrahaus/credentials` (mode 600, root-only access)
- **No Defaults:** No hardcoded passwords - each container has unique credentials
- **Easy Access:** Credentials displayed in welcome banner and accessible via simple commands

### Viewing Credentials

**From ProxmoxVE host:**

```bash
# View all credentials
pct exec <container-id> -- cat /etc/infrahaus/credentials

# Stream welcome message with credentials
pct exec <container-id> -- journalctl -u config-manager -f --no-pager -o cat
```

**Inside the container:**

```bash
# View credentials file directly (requires root)
sudo cat /etc/infrahaus/credentials

# Or use the welcome message command
cat /etc/motd
```

**Example credentials output:**

```bash
# Generated credentials for Web3 Dev Container
CODE_SERVER_PASSWORD=Abc123Xyz789Def4
FILEBROWSER_USERNAME=admin
FILEBROWSER_PASSWORD=Xyz456Abc123Ghi7
OPENCODE_PASSWORD=Def789Jkl012Mno3
```

### Changing Passwords

**VS Code Server (code-server):**

```bash
# Method 1: Edit systemd service file
sudo vim /etc/systemd/system/code-server@.service
# Update the PASSWORD= line under [Service]
sudo systemctl daemon-reload
sudo systemctl restart code-server@coder

# Method 2: Use hashed password (more secure)
# Generate hash
echo -n "your-new-password" | npx argon2-cli -e
# Update service file with hashed value
sudo vim /etc/systemd/system/code-server@.service
# Change: Environment=PASSWORD=your-hash
# Change: Environment=HASHED_PASSWORD=true
sudo systemctl daemon-reload
sudo systemctl restart code-server@coder
```

**FileBrowser:**

```bash
# Change password via CLI
sudo filebrowser users update admin --password "new-password"
sudo systemctl restart filebrowser
```

**OpenCode:**

```bash
# Edit systemd service file
sudo vim /etc/systemd/system/opencode@.service
# Add: --password "new-password" to ExecStart line
sudo systemctl daemon-reload
sudo systemctl restart opencode@coder
```

**Update credentials file (optional):**

```bash
# Update stored credentials for reference
sudo vim /etc/infrahaus/credentials
```

### Security Best Practices

1. **Rotate Passwords:** Change default generated passwords after first login
2. **Network Isolation:** Use ProxmoxVE firewall to restrict web service access
3. **HTTPS:** Use reverse proxy (nginx/traefik) with Let's Encrypt certificates
4. **VPN Access:** Consider accessing web services through VPN
5. **Backup Credentials:** Store credentials in password manager after first boot
6. **Container Snapshots:** Take snapshot before making security changes

### Manual Configuration Management

```bash
# Inside container - trigger manual sync
sudo systemctl restart config-manager

# Check sync status
journalctl -u config-manager -f

# View sync logs
cat /var/log/config-manager/sync.log

# Configuration rollback
config-rollback status    # Check current state
config-rollback list      # List available snapshots
config-rollback <hash>    # Rollback to specific snapshot
```

## Container Management

### Access Methods

#### Terminal Access

```bash
# SSH access (after container is created)
ssh coder@<container-ip>

# Console access (from ProxmoxVE host)
pct enter <container-id>
```

#### Browser-Based Development

Access your development environment through the browser:

```
VS Code Server:   http://<container-ip>:8080
FileBrowser:      http://<container-ip>:8081
OpenCode:         http://<container-ip>:8082
```

**Get passwords:**

```bash
# From ProxmoxVE host
pct exec <container-id> -- cat /etc/infrahaus/credentials

# Inside container
sudo cat /etc/infrahaus/credentials
```

**Features:**

- Full VS Code experience in the browser
- Pre-installed extensions from Microsoft Marketplace (Solidity, Docker, GitLens, Copilot, Live Share)
- File management and uploads via FileBrowser
- Auto-save and format-on-save enabled
- Git integration with GitLens
- Password-protected services with unique credentials

**First Time Setup:**

1. Retrieve credentials: `pct exec <container-id> -- cat /etc/infrahaus/credentials`
2. Open `http://<container-ip>:8080` in your browser
3. Enter the `CODE_SERVER_PASSWORD` from credentials file
4. Open folder: `/home/coder`
5. Start coding!
6. (Optional) Change passwords following [Credentials & Security](#credentials--security) guide

### Updates

#### Automatic Updates

- Configuration syncs automatically on every container boot
- Development tools update via git-synced packages

#### Manual Updates

```bash
# Inside container - update system packages
apt update && apt upgrade -y

# Sync latest configuration
sudo systemctl restart config-manager
```

#### ProxmoxVE Updates

From ProxmoxVE host:

```bash
# Find container ID
pct list | grep "Web3 Dev"

# Enter container and update
pct enter <container-id>
apt update && apt upgrade -y
systemctl restart config-manager
```

## Creating Custom Templates

Templates use a **shared generic installer** with template-specific configuration. Creating new templates is simple:

### Template Architecture

```
templates/my-template/
├── container.sh          # Sources template.conf, uses shared installer
├── template.conf         # Template metadata (APP name, tags, defaults)
└── container-configs/    # Template-specific configuration
    ├── packages/         # Your package lists
    ├── scripts/          # Your boot scripts
    └── files/            # Your config files

Shared across all templates:
└── scripts/install-lxc-template.sh  # Generic installer (DRY principle)
```

### Creating a New Template

```bash
# 1. Copy entire template directory
cp -r infra/lxc/templates/web3-dev infra/lxc/templates/my-template

# 2. Edit template.conf (metadata only)
vim infra/lxc/templates/my-template/template.conf
# Change: TEMPLATE_APP, TEMPLATE_TAGS, TEMPLATE_CONFIG_PATH
# Adjust: TEMPLATE_CPU, TEMPLATE_RAM, etc.

# 3. Update container.sh (usually just the script URL)
vim infra/lxc/templates/my-template/container.sh
# Only if you want to change the deployment URL in comments

# 4. Customize container-configs/ (your packages and scripts)
cd infra/lxc/templates/my-template/container-configs/packages/
# Remove web3 packages, add your packages
# Update scripts/ and files/ as needed

# 5. Update README.md
# Document your template

# That's it! install.sh is shared, container.sh is generic
```

### Example: Python Data Science Template

```bash
# 1. Copy web3-dev template
cp -r infra/lxc/templates/web3-dev infra/lxc/templates/datascience

# 2. Edit template.conf
cat > infra/lxc/templates/datascience/template.conf << 'EOF'
#!/usr/bin/env bash
TEMPLATE_APP="Data Science Container"
TEMPLATE_TAGS="python;datascience;jupyter;ml"
TEMPLATE_DESCRIPTION="Python data science environment with Jupyter"
TEMPLATE_CONFIG_PATH="infra/lxc/templates/datascience/container-configs"
TEMPLATE_CPU="${TEMPLATE_CPU:-8}"
TEMPLATE_RAM="${TEMPLATE_RAM:-16384}"
TEMPLATE_DISK="${TEMPLATE_DISK:-30}"
TEMPLATE_OS="${TEMPLATE_OS:-ubuntu}"
TEMPLATE_VERSION="${TEMPLATE_VERSION:-24.04}"
TEMPLATE_PRIVILEGED="${TEMPLATE_PRIVILEGED:-1}"  # Unprivileged
TEMPLATE_NESTING="${TEMPLATE_NESTING:-0}"
TEMPLATE_KEYCTL="${TEMPLATE_KEYCTL:-0}"
TEMPLATE_FUSE="${TEMPLATE_FUSE:-0}"
EOF

# 3. Replace packages in datascience/container-configs/packages/
cd infra/lxc/templates/datascience/container-configs/packages/
rm -f {cli,node,web3,web-tools}.custom
echo "python3 python3-pip python3-venv jupyter-notebook" > python.apt
cat > ml.custom << 'EOF'
#!/bin/bash
pip3 install pandas numpy matplotlib scikit-learn tensorflow
EOF
chmod +x ml.custom

# Done! container.sh automatically uses the shared installer
# Each template is completely independent!
```

## Architecture Benefits

### vs Coder/Docker Setup

- **Boot time:** ~60% faster (1-2 min vs 3-5 min)
- **Memory overhead:** 90% reduction (~100 MB vs ~1 GB agent)
- **CPU overhead:** ~75% reduction (<2% vs 5-10%)
- **Storage efficiency:** ~30% less usage (direct FS vs Docker layers)

### Operational Advantages

- **Direct LXC:** No middleware complexity
- **Git-based:** Version controlled, reviewable configuration
- **Rollback capable:** Snapshot support with conflict detection
- **Declarative:** Infrastructure as code
- **Flexible:** Easy to create custom templates

## Requirements

- **ProxmoxVE:** 8.x or 9.x
- **Network:** Internet access for package downloads and git sync
- **Storage:** Sufficient pool space for container disk (minimum 20GB)
- **Permissions:** Ability to create containers (unprivileged by default)

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

# View detailed logs
journalctl -u config-manager -n 50

# Check sync logs
cat /var/log/config-manager/sync.log

# Test manual sync
sudo systemctl restart config-manager
```

### Docker Issues

```bash
# Verify Docker is installed
docker --version

# Check Docker daemon
systemctl status docker

# Verify user is in docker group
groups coder
```

### Tool Not in PATH

Some tools may require container restart after first sync:

```bash
# From ProxmoxVE host
pct reboot <container-id>

# Or inside container
sudo reboot
```

### Web Services Issues

```bash
# Check if services are running
systemctl status code-server@coder
systemctl status filebrowser
systemctl status opencode@coder

# Restart services
sudo systemctl restart code-server@coder
sudo systemctl restart filebrowser
sudo systemctl restart opencode@coder

# Check service logs
journalctl -u code-server@coder -n 50
journalctl -u filebrowser -n 50
journalctl -u opencode@coder -n 50

# Verify ports are listening
ss -tlnp | grep ':808'

# Check firewall (if enabled)
ufw status
```

**Common Issues:**

- **Can't access port 8080:** Check if code-server is running: `systemctl status code-server@coder`
- **Password not working:** Get credentials: `sudo cat /etc/infrahaus/credentials`
- **Credentials file missing:** Wait for config-manager to complete: `journalctl -u config-manager -f`
- **Port conflicts:** Ensure ports 8080-8082 are not already in use: `ss -tlnp | grep ':808'`
- **VS Code extensions not loading:** Check EXTENSIONS_GALLERY is set: `cat /etc/environment | grep EXTENSIONS`
- **VS Code extension missing (ms-vsliveshare):** Restart code-server: `sudo systemctl restart code-server@coder`
- **Container fails on first boot:** Check for apt lock issues: `journalctl -u config-manager -n 100`

## Security Considerations

### Sudo Access

The `coder` user has passwordless sudo for specific development commands:

- `/usr/bin/systemctl` - Service management
- `/usr/bin/docker` - Docker operations
- `/usr/bin/git` - Git operations
- `/usr/local/bin/config-sync.sh` - Configuration sync
- `/usr/local/bin/config-rollback` - Configuration rollback

All other sudo commands require password authentication.

### Container Security

This template creates an **unprivileged** LXC container by default for enhanced security. Docker-in-Docker is supported via nested containers with proper user namespace mapping.

**Security Features:**

- Unprivileged by default (can be changed via `var_unprivileged=0`)
- Random password generation for all services
- Credentials stored in root-only file (mode 600)
- Restricted sudo access for `coder` user
- User namespace isolation

### Web Service Security

The container exposes web services on ports 8080-8082 for browser-based development:

- **code-server (8080):** Password authentication (random, 16 chars)
- **filebrowser (8081):** Username/password authentication (random, 16 chars)
- **opencode (8082):** Password authentication (random, 16 chars)

**Security Recommendations:**

1. **Rotate passwords** after first login (see [Credentials & Security](#credentials--security))
2. **Use reverse proxy** (nginx/traefik) with HTTPS for production
3. **Firewall rules:** Restrict access to trusted networks only
4. **VPN access:** Consider accessing web services through VPN
5. **Container isolation:** Run in isolated network or VLAN
6. **Backup credentials:** Store in password manager after first boot

**ProxmoxVE Firewall Example:**

```bash
# From ProxmoxVE host
pct set <container-id> -net0 name=eth0,bridge=vmbr0,firewall=1,ip=dhcp

# Add firewall rules in ProxmoxVE web UI:
# - Allow 8080-8082 from specific IP ranges only
# - Block all other incoming connections
```

### Download Security

- **build.func:** Pinned to immutable tag `2026-02-02`
- **Starship:** Downloaded as prebuilt binary from GitHub releases
- **Config-manager:** Downloaded with validation and verification
- **code-server:** Official installation script from code-server.dev
- **filebrowser:** Official installation script from filebrowser.org

## Contributing

### Reporting Issues

Report issues at: https://github.com/kethalia/infrahaus/issues

### Creating Templates

Share your custom templates by:

1. Creating a PR with your template in `infra/lxc/templates/your-template/`
2. Include comprehensive README documenting use case
3. Provide example configuration in `container-configs-your-template/`

## License

MIT - See [LICENSE](https://github.com/kethalia/infrahaus/blob/main/LICENSE)

## Related Documentation

- [Credentials & Security Guide](./CREDENTIALS.md) - Detailed credential management
- [Testing Guide](./TESTING.md) - Container testing procedures
- [ProxmoxVE Community Scripts](https://github.com/community-scripts/ProxmoxVE)
- [Config-Manager Documentation](../../scripts/config-manager/)
- [Container Configs](../../container-configs/)

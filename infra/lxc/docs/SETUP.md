# LXC Template Setup Guide

## Overview

The LXC template system provides a declarative, git-based approach to creating and managing ProxmoxVE LXC containers. Each template is completely self-contained and includes:

- **Container creation script** — Automated ProxmoxVE container provisioning
- **Configuration management** — Git-based config sync with snapshot/rollback support
- **Pre-configured packages** — Development tools, runtime environments, CLI utilities
- **Managed files** — Shell configs, tool settings, custom scripts
- **Boot-time scripts** — Setup automation that runs on every boot

### Why Use LXC Templates?

- **Infrastructure as Code**: Everything defined in git, version-controlled and auditable
- **Reproducibility**: Create identical environments on-demand
- **Resource Efficiency**: LXC containers are lighter than VMs (10-20% overhead vs 100%+)
- **Automatic Updates**: Config-manager syncs your setup from git on every boot
- **Snapshot/Rollback**: Built-in backup system with automatic pre-sync snapshots
- **DRY Principle**: Share common configs across multiple containers

### Architecture

```
ProxmoxVE Host
├── LXC Container (Ubuntu 24.04)
│   ├── Config-Manager Service (systemd)
│   │   ├── Git Sync (/opt/config-manager/repo)
│   │   ├── Script Execution (00-pre-checks.sh → 99-post-setup.sh)
│   │   ├── File Management (bashrc, aliases, gitconfig)
│   │   ├── Package Installation (apt, npm, pip, custom)
│   │   └── Snapshot System (ZFS/LVM/BTRFS/file-level)
│   ├── Installed Tools (Docker, Node.js, etc.)
│   └── User Environment (coder:1000)
└── Template Repository (GitHub)
    └── infra/lxc/templates/web3-dev/container-configs/
        ├── scripts/
        ├── files/
        └── packages/
```

## Quick Start

### One-Command Deployment

From your ProxmoxVE host shell (SSH into Proxmox):

```bash
# Deploy web3-dev template with defaults
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"
```

**What happens:**

1. Downloads and executes `container.sh` from the template
2. Creates LXC container (ID auto-assigned, Ubuntu 24.04, 4 CPU, 8GB RAM, 20GB disk)
3. Installs config-manager inside the container
4. Runs initial configuration sync from git
5. Executes all setup scripts (Docker, Node.js, Web3 tools, etc.)
6. Container is ready to use

**Duration**: 5-10 minutes (depends on network speed and package mirrors)

### Custom Configuration

Override defaults using environment variables:

```bash
# Custom resources: 2 CPU, 4GB RAM, 30GB disk
var_cpu=2 var_ram=4096 var_disk=30 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"

# Custom git repository and branch
REPO_URL="https://github.com/yourusername/your-fork.git" \
REPO_BRANCH="develop" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"

# Unprivileged container (no Docker-in-Docker)
var_unprivileged=1 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"
```

### Available Templates

| Template   | OS           | Default Resources    | Key Tools                                | Use Case                    |
| ---------- | ------------ | -------------------- | ---------------------------------------- | --------------------------- |
| `web3-dev` | Ubuntu 24.04 | 4 CPU, 8GB RAM, 20GB | Docker, Node.js, Foundry, VS Code Server | Web3/blockchain development |

More templates coming soon (contributions welcome!).

## Resource Requirements

### Minimum Specifications

- **CPU**: 2 cores (for basic development)
- **RAM**: 2 GB (for lightweight workloads)
- **Disk**: 10 GB (OS + essential tools only)
- **Network**: DHCP-assigned IP on ProxmoxVE bridge

**Use case**: Simple shell environment, git operations, text editing

### Recommended Specifications

- **CPU**: 4 cores (smooth multi-tasking)
- **RAM**: 8 GB (run Docker containers, build projects)
- **Disk**: 20 GB (room for projects, Docker images)
- **Network**: Static IP or DHCP reservation

**Use case**: Full-stack development, running databases, Docker Compose stacks

### High-Performance Specifications

- **CPU**: 8+ cores (parallel builds, CI/CD pipelines)
- **RAM**: 16+ GB (heavy Docker usage, multiple projects)
- **Disk**: 50+ GB (many Docker images, large repos)
- **Network**: Static IP, dedicated VLAN

**Use case**: Kubernetes development, AI/ML workloads, intensive build processes

### Per-Workload Recommendations

| Workload                       | CPU | RAM     | Disk     | Notes                                      |
| ------------------------------ | --- | ------- | -------- | ------------------------------------------ |
| Frontend dev (React, Vue)      | 2-4 | 4-8 GB  | 15 GB    | Node.js builds can be memory-intensive     |
| Backend dev (Node, Go, Python) | 2-4 | 4-8 GB  | 15 GB    | Database containers increase RAM needs     |
| Full-stack + Docker Compose    | 4-6 | 8-12 GB | 20-30 GB | Multiple containers running simultaneously |
| Web3 development               | 4-8 | 8-16 GB | 20-30 GB | Local blockchain nodes are CPU/RAM heavy   |
| Kubernetes/microk8s            | 8+  | 16+ GB  | 50+ GB   | Control plane + worker nodes               |

## Installation

### Prerequisites

- ProxmoxVE 7.0+ installed and accessible
- Root or sudo access to ProxmoxVE host
- Internet connection for downloading OS templates and packages
- Available storage for container creation

### Method 1: Using ProxmoxVE Pattern (Recommended)

This is the fastest method and requires no manual steps:

```bash
# SSH into your ProxmoxVE host
ssh root@proxmox-host

# Run the template's container.sh script
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"
```

**Environment Variables**:

| Variable           | Description              | Default          | Example                                    |
| ------------------ | ------------------------ | ---------------- | ------------------------------------------ |
| `var_cpu`          | Number of CPU cores      | `4`              | `var_cpu=2`                                |
| `var_ram`          | RAM in megabytes         | `8192`           | `var_ram=4096`                             |
| `var_disk`         | Disk size in gigabytes   | `20`             | `var_disk=30`                              |
| `var_os`           | OS template name         | `ubuntu`         | `var_os=debian`                            |
| `var_version`      | OS version               | `24.04`          | `var_version=12`                           |
| `var_unprivileged` | Unprivileged mode        | `0` (privileged) | `var_unprivileged=1`                       |
| `var_nesting`      | Enable container nesting | `1` (enabled)    | `var_nesting=0`                            |
| `var_keyctl`       | Enable keyctl            | `1` (enabled)    | `var_keyctl=0`                             |
| `var_fuse`         | Enable FUSE              | `1` (enabled)    | `var_fuse=0`                               |
| `REPO_URL`         | Git repository URL       | Template default | `REPO_URL=https://github.com/you/repo.git` |
| `REPO_BRANCH`      | Git branch               | `main`           | `REPO_BRANCH=develop`                      |

**Note**: `CONFIG_PATH` is automatically set by each template to point to its `container-configs/` directory. You generally don't need to override this unless using a completely custom repository structure.

### Method 2: Manual Installation

For more control or when troubleshooting:

#### Step 1: Download Template Files

```bash
# Clone the repository
git clone https://github.com/kethalia/infrahaus.git
cd infrahaus/infra/lxc/templates/web3-dev
```

#### Step 2: Review and Customize template.conf

```bash
# View template configuration
cat template.conf

# Edit if needed (optional)
nano template.conf
```

**Key settings in template.conf**:

```bash
TEMPLATE_APP="Web3 Development"
TEMPLATE_CPU="${TEMPLATE_CPU:-4}"
TEMPLATE_RAM="${TEMPLATE_RAM:-8192}"
TEMPLATE_DISK="${TEMPLATE_DISK:-20}"
TEMPLATE_OS="${TEMPLATE_OS:-ubuntu}"
TEMPLATE_VERSION="${TEMPLATE_VERSION:-24.04}"
TEMPLATE_CONFIG_PATH="infra/lxc/templates/web3-dev/container-configs"
```

#### Step 3: Run container.sh

```bash
# With defaults
bash container.sh

# With custom settings
var_cpu=2 var_ram=4096 bash container.sh
```

#### Step 4: Verify Installation

```bash
# Check container status
pct list | grep web3

# View container logs
pct enter <container-id>
journalctl -u config-manager -n 50
```

### Method 3: Creating from Scratch

See the "Creating Custom Templates" section below for building your own template.

## First Boot

### What Happens During First Boot

When a container created from a template starts for the first time:

1. **Systemd starts config-manager.service** — The service is enabled during installation
2. **Lock acquisition** — Ensures only one sync runs at a time
3. **Ensure git is installed** — Auto-installs git if missing (using apt/dnf/apk)
4. **Ensure helper scripts available** — Auto-downloads helper scripts if missing
5. **Initial git clone** — Downloads your configuration repository to `/opt/config-manager/repo`
6. **Pre-sync snapshot attempt** — A pre-sync snapshot is attempted on every run; when no snapshot backend is detected, config-manager falls back to file-level backup
7. **Script execution** — Runs all `*.sh` files in `container-configs/scripts/` in alphabetical order
   - `00-pre-checks.sh` — Validates environment
   - `01-setup-user.sh` — Creates `coder` user with UID 1000
   - `02-docker-install.sh` — Installs Docker CE
   - `03-nodejs-setup.sh` — Installs Node.js and PNPM
   - `04-web3-tools.sh` — Installs Foundry, Hardhat, etc.
   - `05-shell-setup.sh` — Configures Starship prompt
   - `50-vscode-server.sh` — Installs VS Code Server
   - `99-post-setup.sh` — Final cleanup and verification
8. **File processing** — Deploys configuration files to target locations
   - The deployed filename matches the source filename exactly (no automatic renaming)
   - `.bashrc` (in repo) → `/home/coder/.bashrc`
   - `.bash_aliases` (in repo) → `/home/coder/.bash_aliases`
   - `.gitconfig` (in repo) → `/home/coder/.gitconfig`
9. **Package installation** — Installs packages from `container-configs/packages/`
10. **Snapshot tagging** — First successful sync is marked as `:good`
11. **Service completion** — Container is ready to use

**Duration**: First boot takes 5-15 minutes depending on:

- Number of packages to install
- Network speed for downloading
- CPU performance for compilation (if any)

### Watching First Boot Progress

```bash
# SSH into ProxmoxVE host
ssh root@proxmox-host

# Enter the container
pct enter <container-id>

# Watch config-manager logs in real-time
journalctl -u config-manager -f

# Or tail the sync log
tail -f /var/log/config-manager/sync.log
```

**What to look for**:

```
[INFO] Starting configuration sync...
[INFO] git is already installed.
[INFO] All helper scripts are already installed.
[INFO] Cloning repository...
[INFO] Executing script: 00-pre-checks.sh
[INFO] Executing script: 01-setup-user.sh
[INFO] User 'coder' created with UID 1000
[INFO] Executing script: 02-docker-install.sh
[INFO] Docker CE installed successfully
[INFO] Processing files...
[INFO] Deployed: /home/coder/.bashrc (policy: default)
[INFO] Installing packages...
[INFO] Installed 42 packages from base.apt
[INFO] Configuration sync completed successfully
```

### Verification Steps

After first boot completes:

```bash
# 1. Check service status
systemctl status config-manager
# Should show: Active: inactive (dead) with exit code 0/SUCCESS
# (Type=oneshot with RemainAfterExit=no means "inactive" after successful completion)

# 2. Verify user creation
id coder
# Should show: uid=1000(coder) gid=1000(coder) groups=1000(coder),27(sudo),999(docker)

# 3. Check installed tools
docker --version
node --version
pnpm --version
forge --version

# 4. Check snapshot was created
config-rollback list
# Should show at least one snapshot with ":good" tag

# 5. View full sync log
cat /var/log/config-manager/sync.log
```

## Accessing Your Environment

### SSH Access

```bash
# From your workstation, SSH to ProxmoxVE first
ssh root@proxmox-host

# Then SSH into the container
pct enter <container-id>

# Or switch to the coder user
pct enter <container-id>
su - coder
```

**Direct SSH** (requires SSH server inside container):

```bash
# Add openssh-server to container-configs/packages/base.apt
# After next sync, SSH directly:
ssh coder@<container-ip>
```

### Port Mappings

The web3-dev template exposes these ports (configure in template.conf):

| Port | Service                        | Access URL                   |
| ---- | ------------------------------ | ---------------------------- |
| 8080 | VS Code Server                 | `http://<container-ip>:8080` |
| 8081 | FileBrowser                    | `http://<container-ip>:8081` |
| 8082 | OpenCode (AI coding assistant) | `http://<container-ip>:8082` |

**Access from browser**:

```bash
# Find container IP
pct exec <container-id> ip addr show eth0 | grep inet

# Open in browser
http://192.168.1.100:8080  # VS Code Server
```

**Expose via reverse proxy** (recommended for production):

See [Networking documentation](../../../apps/web/content/docs/getting-started/networking.mdx) for Nginx Proxy Manager setup.

### Web Interfaces

#### VS Code Server (code-server)

- **URL**: `http://<container-ip>:8080`
- **Login**: Password set during installation (check logs or `/home/coder/.config/code-server/config.yaml`)
- **Features**: Full VS Code experience in browser, extensions, integrated terminal

#### FileBrowser

- **URL**: `http://<container-ip>:8081`
- **Login**: Default is `admin` / `admin` (change after first login)
- **Features**: Upload/download files, manage projects, web-based file operations

#### OpenCode (AI Coding Assistant)

- **URL**: `http://<container-ip>:8082`
- **Features**: AI-powered code completion, chat-based coding assistant
- **Note**: Requires additional configuration (API keys, model selection)

## Customization

### Adjusting Resources

#### While Container is Running

```bash
# Stop the container first
pct stop <container-id>

# Update resources
pct set <container-id> -cores 6 -memory 12288 -rootfs local-lvm:30

# Start container
pct start <container-id>
```

#### When to Resize vs Recreate

**Resize existing container when**:

- You just need more CPU/RAM
- Projects and data are valuable
- Container has been heavily customized

**Recreate from template when**:

- Disk space increase is significant (>50%)
- You want a clean slate
- Configuration is all in git (reproducible)

**Tip**: If all your configs are git-managed and projects are in remote repositories, recreation is fast and guaranteed to be clean.

### Using Your Own Repository

To use a fork or custom repository:

```bash
# Deploy with custom repo
REPO_URL="https://github.com/yourusername/your-configs.git" \
REPO_BRANCH="main" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"
```

**Repository structure required**:

```
your-configs/
└── infra/lxc/templates/web3-dev/container-configs/
    ├── scripts/
    ├── files/
    └── packages/
```

**Or use a completely custom path**:

1. Fork the repository
2. Modify `template.conf` to set `TEMPLATE_CONFIG_PATH="your/custom/path"`
3. Deploy your forked template

### Customizing Template Configs

Each template has its own `container-configs/` directory. To customize:

#### Option 1: Edit in Git (Recommended)

```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/yourusername/pve-home-lab.git
cd infrahaus/infra/lxc/templates/web3-dev/container-configs

# Add your packages
echo "vim" >> packages/base.apt
echo "htop" >> packages/base.apt

# Add your scripts
nano scripts/60-my-custom-setup.sh

# Add your files
cp ~/.vimrc files/vimrc
echo "/home/coder" > files/vimrc.path
echo "default" > files/vimrc.policy

# Commit and push
git add .
git commit -m "Add custom tools and configs"
git push

# Deploy container with your fork
REPO_URL="https://github.com/yourusername/pve-home-lab.git" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/yourusername/pve-home-lab/main/infra/lxc/templates/web3-dev/container.sh)"
```

#### Option 2: Edit Inside Container (Quick Testing)

```bash
# Enter container
pct enter <container-id>

# Edit config files in /opt/config-manager/repo
cd /opt/config-manager/repo/infra/lxc/templates/web3-dev/container-configs

# Make changes (they'll be overwritten on next sync unless you commit them)
nano packages/base.apt

# Manually run config sync to test
systemctl restart config-manager

# If satisfied, commit changes to your git repo
```

**Note**: Changes made inside the container are lost on next git sync unless committed to your repository.

## Creating Custom Templates

### Template Directory Structure

```
templates/my-custom-template/
├── container.sh              # ProxmoxVE container creation script
├── template.conf             # Template metadata and defaults
├── README.md                 # Template documentation
└── container-configs/        # Template-specific configuration
    ├── packages/
    │   ├── base.apt          # Base system packages
    │   └── custom.custom     # Custom installers
    ├── scripts/
    │   ├── 00-pre-checks.sh
    │   ├── 01-setup-user.sh
    │   └── 99-post-setup.sh
    └── files/
        ├── bashrc
        ├── bashrc.path
        └── bashrc.policy
```

### Minimal Template Example

#### 1. Create template directory

```bash
mkdir -p infra/lxc/templates/my-template/container-configs/{packages,scripts,files}
```

#### 2. Create template.conf

```bash
cat > infra/lxc/templates/my-template/template.conf << 'EOF'
TEMPLATE_APP="My Custom Template"
TEMPLATE_TAGS="custom;development"
TEMPLATE_DESCRIPTION="My custom development environment"
TEMPLATE_CONFIG_PATH="infra/lxc/templates/my-template/container-configs"

# Resource defaults
TEMPLATE_CPU="${TEMPLATE_CPU:-2}"
TEMPLATE_RAM="${TEMPLATE_RAM:-4096}"
TEMPLATE_DISK="${TEMPLATE_DISK:-15}"
TEMPLATE_OS="${TEMPLATE_OS:-ubuntu}"
TEMPLATE_VERSION="${TEMPLATE_VERSION:-24.04}"

# Container features
TEMPLATE_PRIVILEGED="${TEMPLATE_PRIVILEGED:-0}"
TEMPLATE_NESTING="${TEMPLATE_NESTING:-1}"
TEMPLATE_KEYCTL="${TEMPLATE_KEYCTL:-1}"
TEMPLATE_FUSE="${TEMPLATE_FUSE:-1}"
EOF
```

#### 3. Create container.sh

```bash
# Copy from existing template
cp infra/lxc/templates/web3-dev/container.sh infra/lxc/templates/my-template/

# Or download the shared pattern
curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh \
  -o infra/lxc/templates/my-template/container.sh
```

#### 4. Add packages

```bash
cat > infra/lxc/templates/my-template/container-configs/packages/base.apt << 'EOF'
# Essential packages
curl
git
wget
vim
htop
build-essential
EOF
```

#### 5. Add setup script

```bash
cat > infra/lxc/templates/my-template/container-configs/scripts/01-setup-user.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Create development user
if ! id coder &>/dev/null; then
    useradd -m -u 1000 -s /bin/bash coder
    usermod -aG sudo coder
    echo "coder ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/coder
    log_info "User 'coder' created"
else
    log_info "User 'coder' already exists"
fi
EOF

chmod +x infra/lxc/templates/my-template/container-configs/scripts/01-setup-user.sh
```

#### 6. Add configuration file

```bash
cat > infra/lxc/templates/my-template/container-configs/files/bashrc << 'EOF'
# Custom bashrc
export PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
alias ll='ls -lah'
alias gs='git status'
EOF

echo "/home/coder" > infra/lxc/templates/my-template/container-configs/files/bashrc.path
echo "default" > infra/lxc/templates/my-template/container-configs/files/bashrc.policy
```

#### 7. Commit and test

```bash
git add infra/lxc/templates/my-template
git commit -m "Add my-template"
git push

# Deploy
bash -c "$(curl -fsSL https://raw.githubusercontent.com/yourusername/pve-home-lab/main/infra/lxc/templates/my-template/container.sh)"
```

### Extending Existing Templates

To create a variant of an existing template:

```bash
# Copy existing template
cp -r infra/lxc/templates/web3-dev infra/lxc/templates/web3-dev-minimal

# Update template.conf
sed -i 's/TEMPLATE_APP="Web3 Development"/TEMPLATE_APP="Web3 Dev Minimal"/' \
  infra/lxc/templates/web3-dev-minimal/template.conf

# Remove unnecessary packages
rm infra/lxc/templates/web3-dev-minimal/container-configs/packages/web3-tools.apt

# Remove unnecessary scripts
rm infra/lxc/templates/web3-dev-minimal/container-configs/scripts/04-web3-tools.sh

# Update CONFIG_PATH in template.conf
sed -i 's|web3-dev/container-configs|web3-dev-minimal/container-configs|' \
  infra/lxc/templates/web3-dev-minimal/template.conf
```

## Next Steps

Now that you have a container set up, explore:

- **[Configuration Reference](CONFIGURATION.md)** — Deep dive into config-manager features, scripts, files, packages, snapshots, and conflict resolution
- **[Migration Guide](MIGRATION.md)** — Moving from Coder workspaces, Docker Compose, or bare-metal setups
- **[Troubleshooting](TROUBLESHOOTING.md)** — Common issues and debugging techniques

### Common First Tasks

1. **Customize your shell**: Edit `files/bashrc` or `files/aliases.sh` in your git repo
2. **Add your favorite tools**: Update `packages/base.apt` or create `packages/my-tools.apt`
3. **Set up SSH keys**: Add a script to `scripts/10-ssh-keys.sh` that copies keys from a secure location
4. **Configure git**: Update `files/gitconfig` with your name and email
5. **Install VS Code extensions**: Add them to a script or use code-server's CLI

### Template Gallery

Explore more templates (coming soon):

- `python-dev` — Python development with Poetry, Jupyter, Django
- `golang-dev` — Go development with language server, testing tools
- `rust-dev` — Rust toolchain with cargo, clippy, rustfmt
- `k8s-dev` — Kubernetes development with kubectl, helm, k9s

**Contributions welcome!** See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for guidelines.

## Troubleshooting

For common issues during setup, see the [Troubleshooting Guide](TROUBLESHOOTING.md).

### Quick Diagnostics

```bash
# Check container status
pct status <container-id>

# Check config-manager service
pct exec <container-id> -- systemctl status config-manager

# View recent logs
pct exec <container-id> -- journalctl -u config-manager -n 50

# Check for conflicts
pct exec <container-id> -- config-rollback status
```

### Getting Help

- **Documentation**: See [CONFIGURATION.md](CONFIGURATION.md), [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **GitHub Issues**: https://github.com/kethalia/infrahaus/issues
- **Discussions**: https://github.com/kethalia/infrahaus/discussions

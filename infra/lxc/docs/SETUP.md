# LXC Configuration Manager — Setup Guide

## Quick Start

### 1. Create the LXC Container

From your **Proxmox VE shell**, run:

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/kethalia/pve-home-lab/main/infra/lxc/scripts/web3-dev-container.sh)"
```

This creates a privileged Ubuntu 24.04 LXC container with:

- 4 CPU cores, 8 GB RAM, 20 GB disk
- Docker-in-Docker support
- config-manager service enabled

### 2. First Boot

On first boot, the `config-manager` service automatically:

1. Clones the git repository
2. Runs all boot scripts (Docker, Node.js, Foundry, Zsh, etc.)
3. Deploys configuration files
4. Installs required packages

This takes **2-5 minutes** on first boot. Subsequent boots are faster (~30s).

### 3. Access Your Container

```bash
# Via Proxmox console or SSH
ssh root@<container-ip>

# Switch to development user
su - coder
```

### 4. Verify Installation

```bash
# Quick smoke test
docker --version
node --version
forge --version
gh --version
zsh --version
```

## Manual Installation

To install config-manager on an **existing** LXC container:

```bash
# Clone the repository
git clone https://github.com/kethalia/pve-home-lab.git /opt/config-manager/repo

# Run the installer
bash /opt/config-manager/repo/infra/lxc/scripts/config-manager/install-config-manager.sh \
  https://github.com/kethalia/pve-home-lab.git \
  --branch main \
  --user coder \
  --run-now
```

## Configuration

Edit `/etc/config-manager/config.env` to customize:

```bash
# Git repository settings
REPO_URL=https://github.com/kethalia/pve-home-lab.git
REPO_BRANCH=main

# Where to clone the repo
REPO_DIR=/opt/config-manager/repo

# Path within the repo to the container configs
CONFIGS_SUBDIR=infra/lxc/container-configs

# Container user (non-root)
CONTAINER_USER=coder

# Snapshot settings
SNAPSHOT_ENABLED=auto     # auto|yes|no
SNAPSHOT_RETENTION_DAYS=7
SNAPSHOT_BACKEND=auto     # auto|zfs|lvm|btrfs|none
```

## Service Management

```bash
# Check service status
systemctl status config-manager

# Re-run configuration sync manually
/usr/local/bin/config-sync.sh

# View logs
journalctl -u config-manager
cat /var/log/config-manager/sync.log

# Check for conflicts
config-rollback status
```

## Container Resources

| Resource | Default | Minimum | Recommended |
|----------|---------|---------|-------------|
| CPU      | 4 cores | 2 cores | 4+ cores    |
| RAM      | 8 GB    | 4 GB    | 8+ GB       |
| Disk     | 20 GB   | 10 GB   | 20+ GB      |
| Type     | Privileged | — | Privileged (for Docker) |

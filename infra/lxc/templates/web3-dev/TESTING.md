# Testing Plan for Web3-Dev Container Template

This document outlines the testing strategy for the web3-dev container template with the new container-configs structure.

## Overview

The web3-dev template now includes:

- **8 new boot scripts** (00, 02-06, 50, 99)
- **1 enhanced script** (99-post-setup.sh)
- **1 new package file** (development.apt)
- **4 configuration file triplets** (12 files total)

All scripts are idempotent and designed to work with the config-manager system.

---

## Testing Strategy

### Option 1: Docker Simulation (Quick Iteration)

Test individual scripts in a Docker container that simulates the LXC environment.

#### Prerequisites

```bash
# Ensure Docker is installed and running
docker --version
```

#### Test Setup

1. **Create test environment:**

```bash
cd /home/coder/pve-home-lab

# Create a test container with Ubuntu 24.04
docker run -it --rm --privileged \
  --name web3-dev-test \
  -v "$(pwd)/infra/lxc/templates/web3-dev/container-configs:/config:ro" \
  -v "$(pwd)/infra/lxc/scripts/config-manager:/opt/config-manager:ro" \
  ubuntu:24.04 bash
```

2. **Inside the container, set up environment variables:**

```bash
# Set required environment variables
export CONTAINER_USER=coder
export CONTAINER_OS=ubuntu
export CONTAINER_OS_VERSION=24.04
export CONFIG_MANAGER_VERSION=0.3.0
export CONFIG_MANAGER_ROOT=/opt/config-manager
export CONFIG_MANAGER_LOG=/var/log/config-manager/sync.log
export CONFIG_MANAGER_FIRST_RUN=true

# Create log directory
mkdir -p /var/log/config-manager

# Source helper functions (from config-manager)
source /opt/config-manager/config-manager-helpers.sh || {
    # If helpers not available, create minimal stubs
    log_info() { echo "[INFO] $*"; }
    log_warn() { echo "[WARN] $*"; }
    log_error() { echo "[ERROR] $*"; }
    is_installed() { command -v "$1" >/dev/null 2>&1; }
    ensure_installed() { apt-get install -y "$1"; }
}
```

3. **Run scripts in sequence:**

```bash
# Test each script individually
cd /config/scripts

# Script 00: Pre-checks
bash -x 00-pre-checks.sh
echo "Exit code: $?"

# Script 01: User setup
bash -x 01-setup-user.sh
echo "Exit code: $?"

# Script 02: Docker install
bash -x 02-docker-install.sh
echo "Exit code: $?"

# Script 03: Node.js setup
bash -x 03-nodejs-setup.sh
echo "Exit code: $?"

# Script 04: Web3 tools
bash -x 04-web3-tools.sh
echo "Exit code: $?"

# Script 05: Shell setup
bash -x 05-shell-setup.sh
echo "Exit code: $?"

# Script 06: Dev tools
bash -x 06-dev-tools.sh
echo "Exit code: $?"

# Script 50: VS Code server
bash -x 50-vscode-server.sh
echo "Exit code: $?"

# Script 99: Post-setup
bash -x 99-post-setup.sh
echo "Exit code: $?"
```

4. **Verify installations:**

```bash
# Check Docker
docker --version
systemctl status docker

# Check Node.js (as coder user)
su - coder -c "node --version"
su - coder -c "npm --version"
su - coder -c "pnpm --version"

# Check Foundry (as coder user)
su - coder -c "forge --version"

# Check other tools
gh --version
act --version
starship --version
code-server --version

# Check services
systemctl status code-server@coder
systemctl status filebrowser
```

5. **Test idempotency (run scripts again):**

```bash
# Run all scripts again - should skip installations
for script in 00-pre-checks.sh 01-setup-user.sh 02-docker-install.sh 03-nodejs-setup.sh 04-web3-tools.sh 05-shell-setup.sh 06-dev-tools.sh 50-vscode-server.sh 99-post-setup.sh; do
    echo "========================================="
    echo "Testing idempotency: $script"
    echo "========================================="
    bash /config/scripts/$script
    echo "Exit code: $?"
done
```

---

### Option 2: ProxmoxVE Integration Test (Full Validation)

Test the complete template deployment in ProxmoxVE environment.

#### Prerequisites

- ProxmoxVE host with access
- Network connectivity to GitHub
- Sufficient storage for container

#### Test Procedure

1. **Deploy new container:**

From ProxmoxVE host:

```bash
# Deploy using the web3-dev template
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/feat/proxmox-lxc-clean/infra/lxc/templates/web3-dev/container.sh)"

# Or with custom resources
var_cpu=2 var_ram=4096 var_disk=20 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/feat/proxmox-lxc-clean/infra/lxc/templates/web3-dev/container.sh)"
```

2. **Monitor installation:**

```bash
# Find the container ID
CTID=$(pct list | grep "Web3 Dev" | awk '{print $1}')

# Enter container
pct enter $CTID

# Monitor config-manager logs
journalctl -u config-manager -f

# Or check sync log
tail -f /var/log/config-manager/sync.log
```

3. **Verify installation:**

```bash
# Inside container as root
docker --version
systemctl status docker
systemctl status code-server@coder
systemctl status filebrowser

# Switch to coder user
su - coder

# Test Node.js
node --version
npm --version
pnpm --version

# Test Foundry
forge --version
cast --version

# Test other tools
gh --version
act --version
starship --version

# Check shell configuration
source ~/.bashrc
echo $PATH
```

4. **Test credentials system:**

```bash
# Verify credentials file exists
sudo cat /etc/infrahaus/credentials

# Check file permissions
ls -l /etc/infrahaus/credentials
# Should show: -rw------- 1 root root

# Verify all required credentials present
grep -E "CODE_SERVER_PASSWORD|FILEBROWSER_USERNAME|FILEBROWSER_PASSWORD|OPENCODE_PASSWORD" /etc/infrahaus/credentials

# Check password format (should be 16 chars, alphanumeric)
sudo grep CODE_SERVER_PASSWORD /etc/infrahaus/credentials | cut -d'=' -f2 | wc -c
# Should output: 17 (16 chars + newline)
```

5. **Test browser access:**

```bash
# Get container IP
CONTAINER_IP=$(hostname -I | awk '{print $1}')
echo "VS Code: http://${CONTAINER_IP}:8080"
echo "FileBrowser: http://${CONTAINER_IP}:8081"
echo "OpenCode: http://${CONTAINER_IP}:8082"

# Get credentials
sudo cat /etc/infrahaus/credentials

# Test from external machine
curl -I http://${CONTAINER_IP}:8080
curl -I http://${CONTAINER_IP}:8081
curl -I http://${CONTAINER_IP}:8082
```

6. **Test configuration files:**

```bash
# As coder user
su - coder

# Check deployed files
ls -la ~/.bashrc
ls -la ~/.config/aliases.sh
ls -la ~/.config/starship.toml
ls -la ~/.gitconfig

# Test aliases
alias | grep -E "^(d|g|ni|pi|fb)="

# Test starship prompt
starship --version
echo $PS1
```

7. **Test VS Code extensions (Microsoft Marketplace):**

```bash
# Check EXTENSIONS_GALLERY is configured
grep EXTENSIONS_GALLERY /etc/environment
cat /home/coder/.bashrc | grep EXTENSIONS_GALLERY

# List installed extensions
ls -la /home/coder/.local/share/code-server/extensions/

# Verify critical extensions installed
ls /home/coder/.local/share/code-server/extensions/ | grep -i "ms-vsliveshare"
ls /home/coder/.local/share/code-server/extensions/ | grep -i "github.copilot"
ls /home/coder/.local/share/code-server/extensions/ | grep -i "juanblanco.solidity"
```

---

## Validation Checklist

### Scripts

- [ ] 00-pre-checks.sh validates environment correctly
- [ ] 01-setup-user.sh creates coder user with proper groups
- [ ] 02-docker-install.sh installs Docker and starts service
- [ ] 03-nodejs-setup.sh installs NVM and Node.js 24
- [ ] 04-web3-tools.sh installs Foundry tools
- [ ] 05-shell-setup.sh installs Starship and configures shell
- [ ] 06-dev-tools.sh installs gh, act, and pnpm
- [ ] 50-vscode-server.sh installs code-server with Microsoft Marketplace extensions
- [ ] 51-filebrowser.sh installs FileBrowser with random password
- [ ] 52-opencode.sh installs OpenCode with random password
- [ ] 99-post-setup.sh validates installation and shows welcome message with credentials
- [ ] All scripts are idempotent (can run multiple times)
- [ ] All scripts handle errors gracefully
- [ ] All scripts log properly
- [ ] Scripts wait for apt locks before package installation

### Packages

- [ ] base.apt packages are installed
- [ ] development.apt packages are installed (python3, rsync, htop, jq, etc.)

### Configuration Files

- [ ] bashrc deployed to /home/coder/.bashrc
- [ ] aliases.sh deployed to /home/coder/.config/aliases.sh
- [ ] starship.toml deployed to /home/coder/.config/starship.toml
- [ ] gitconfig deployed to /home/coder/.gitconfig
- [ ] All files have correct ownership (coder:coder)
- [ ] Policy enforcement works (default vs replace)

### Services

- [ ] docker.service is running and enabled
- [ ] code-server@coder.service is running and enabled
- [ ] filebrowser.service is running and enabled
- [ ] opencode@coder.service is running and enabled
- [ ] Services auto-start on container reboot

### Credentials & Security

- [ ] /etc/infrahaus/credentials file exists
- [ ] Credentials file has correct permissions (600, root:root)
- [ ] All required credentials present (CODE*SERVER_PASSWORD, FILEBROWSER*\*, OPENCODE_PASSWORD)
- [ ] Passwords are 16 characters, alphanumeric
- [ ] Each password is unique (not duplicated)
- [ ] Passwords work for their respective services
- [ ] EXTENSIONS_GALLERY configured in /etc/environment
- [ ] EXTENSIONS_GALLERY configured in ~/.bashrc
- [ ] EXTENSIONS_GALLERY passed through run_as_user function

### Functionality

- [ ] Docker commands work without sudo for coder user
- [ ] Node.js and npm are available in PATH
- [ ] pnpm is installed and working
- [ ] Foundry tools (forge, cast, anvil, chisel) are in PATH
- [ ] GitHub CLI (gh) is installed and working
- [ ] act is installed and working
- [ ] Starship prompt displays correctly
- [ ] Shell aliases work (d, dc, g, gs, etc.)
- [ ] VS Code is accessible on port 8080 (requires password)
- [ ] FileBrowser is accessible on port 8081 (requires username/password)
- [ ] OpenCode is accessible on port 8082 (requires password)
- [ ] VS Code extensions are installed from Microsoft Marketplace
- [ ] ms-vsliveshare extension is present (validates Microsoft Marketplace usage)
- [ ] No dpkg/apt lock errors during initial setup

### User Experience

- [ ] Welcome message displays on first boot with credentials
- [ ] Validation checks pass in 99-post-setup.sh
- [ ] All tools are documented in welcome message
- [ ] Service URLs are displayed correctly
- [ ] Credentials are shown in welcome banner
- [ ] Instructions for viewing credentials are clear
- [ ] Password change instructions are provided

---

## Troubleshooting

### Common Issues

**Script fails with "command not found":**

- Check that helper functions are sourced
- Verify PATH includes required directories
- Ensure prerequisites are installed

**Docker fails to start:**

- Check if container is privileged (required for Docker-in-Docker)
- Verify nesting is enabled in container features
- Check Docker daemon logs: `journalctl -u docker`

**Services not accessible:**

- Verify services are running: `systemctl status <service>`
- Check firewall rules
- Verify correct IP address

**Tools not in PATH:**

- Reload shell: `source ~/.bashrc`
- Check PATH variable: `echo $PATH`
- Restart container if needed

**Idempotency fails:**

- Check script logic for proper guards
- Review logs for error messages
- Verify conditional checks work correctly

---

## Next Steps After Testing

1. **Document any issues found**
2. **Fix bugs and retest**
3. **Update scripts based on feedback**
4. **Commit changes to repository**
5. **Deploy to production**

---

## Test Results Template

```
# Test Run: [Date]
# Tester: [Name]
# Environment: [Docker / ProxmoxVE]

## Summary
- Total tests: XX
- Passed: XX
- Failed: XX
- Skipped: XX

## Failed Tests
1. [Test name]: [Issue description]
2. [Test name]: [Issue description]

## Notes
- [Any additional observations]
- [Performance notes]
- [Suggestions for improvement]

## Conclusion
[Pass/Fail with overall assessment]
```

---

## Quick Test Commands

For rapid validation in Docker:

```bash
# One-liner to run all tests in sequence
docker run -it --rm --privileged \
  -v "$(pwd)/infra/lxc/templates/web3-dev/container-configs:/config:ro" \
  ubuntu:24.04 bash -c '
    export CONTAINER_USER=coder CONTAINER_OS=ubuntu CONTAINER_OS_VERSION=24.04
    log_info() { echo "[INFO] $*"; }
    log_warn() { echo "[WARN] $*"; }
    log_error() { echo "[ERROR] $*"; }
    is_installed() { command -v "$1" >/dev/null 2>&1; }
    ensure_installed() { apt-get install -y "$1"; }
    for script in /config/scripts/*.sh; do
        echo "========== Testing: $(basename $script) =========="
        bash "$script" || echo "FAILED: $script"
    done
'
```

---

## Automated Test Script (Optional)

For more comprehensive testing, we could create an automated test harness that:

1. Spins up test containers
2. Runs all scripts
3. Validates installations
4. Tests idempotency
5. Generates report

Let me know if you'd like me to create this automated test script!

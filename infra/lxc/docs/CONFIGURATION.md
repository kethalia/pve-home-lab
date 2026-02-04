# LXC Configuration Reference

## Table of Contents

- [System Architecture](#system-architecture)
  - [Overview](#overview)
  - [Boot Sequence](#boot-sequence)
  - [Component Interaction](#component-interaction)
- [Configuration File](#configuration-file)
  - [Git Repository Settings](#git-repository-settings)
  - [Snapshot Settings](#snapshot-settings)
  - [Container User](#container-user)
- [Script Execution](#script-execution)
  - [Directory Structure](#directory-structure)
  - [Naming and Ordering](#naming-and-ordering)
  - [Execution Behavior](#execution-behavior)
  - [Environment Variables](#environment-variables)
  - [Helper Functions](#helper-functions)
  - [Writing Scripts](#writing-scripts)
- [File Management](#file-management)
  - [File Triplet Format](#file-triplet-format)
  - [Policies](#policies)
  - [Processing Logic](#processing-logic)
  - [Real-World Examples](#real-world-examples)
- [Package Management](#package-management)
  - [Supported Package Managers](#supported-package-managers)
  - [Package File Format](#package-file-format)
  - [Version Pinning](#version-pinning)
  - [Custom Installers](#custom-installers)
  - [Processing Behavior](#processing-behavior)
- [Snapshot System](#snapshot-system)
  - [Supported Backends](#supported-backends)
  - [Configuration](#configuration)
  - [Snapshot Lifecycle](#snapshot-lifecycle)
  - [Manual Commands](#manual-commands)
- [Conflict Detection](#conflict-detection)
  - [How It Works](#how-it-works)
  - [State Files](#state-files)
  - [Resolution Workflow](#resolution-workflow)
- [CLI Tools](#cli-tools)
  - [config-rollback](#config-rollback)
  - [snapshot-manager](#snapshot-manager)
- [Service Management](#service-management)
- [Exit Codes](#exit-codes)
- [File System Layout](#file-system-layout)
- [Advanced Topics](#advanced-topics)

---

## System Architecture

### Overview

The LXC config-manager is a git-based declarative configuration management system designed for ProxmoxVE containers. It runs as a systemd service and orchestrates four main phases:

1. **Script Execution** — Run bash scripts in alphabetical order
2. **File Processing** — Deploy configuration files with policy-based conflict resolution
3. **Package Installation** — Install packages from multiple package managers (apt, npm, pip, custom)
4. **Snapshot Management** — Automatic backup before sync, rollback on failure

```
┌─────────────────────────────────────────────────────────────┐
│                    config-manager.service                    │
│                        (systemd)                             │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼───────┐
                    │  config-sync   │  Main orchestrator
                    └────────┬───────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
   │ Snapshot │      │ Conflict    │     │ Git Sync    │
   │ Manager  │      │ Detector    │     │             │
   └────┬─────┘      └──────┬──────┘     └──────┬──────┘
        │                   │                    │
        │        ┌──────────▼─────┐              │
        │        │ Validation     │              │
        │        │ (abort/proceed)│              │
        │        └──────────┬─────┘              │
        │                   │                    │
        └───────────────────┴────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
      ┌────▼────┐    ┌──────▼──────┐  ┌─────▼──────┐
      │ Execute │    │ Process     │  │ Install    │
      │ Scripts │    │ Files       │  │ Packages   │
      └─────────┘    └─────────────┘  └────────────┘
```

**Key Features**:

- **Idempotent**: Running config sync multiple times produces the same result
- **Atomic**: Changes are validated before applying (rollback on conflict)
- **Versioned**: All configs tracked in git with full history
- **Automatic**: Runs on every boot via systemd
- **Safe**: Pre-sync snapshots allow instant rollback

### Boot Sequence

When a container starts, config-manager executes this sequence:

```
1. systemd starts config-manager.service
   ↓
2. config-sync.sh acquires lock (/run/config-manager/config-manager.lock)
   ↓
3. Read configuration (/etc/config-manager/config.env)
   ↓
4. Ensure git is installed (auto-install if missing)
   ↓
5. Ensure helper scripts are available (auto-download if missing)
   ↓
6. Create pre-sync snapshot (ZFS/LVM/BTRFS/file-level)
   ↓
7. Compute checksums of managed files (conflict detection)
   ↓
8. Git sync (clone or pull from CONFIG_REPO_URL)
   ↓
9. Compare checksums (detect conflicts)
   ├─ Conflicts detected → ABORT (exit 5)
   └─ No conflicts → PROCEED
   ↓
10. Execute scripts (alphabetical order)
    00-pre-checks.sh
    01-setup-user.sh
    02-docker-install.sh
    ...
    99-post-setup.sh
   ↓
11. Process files (deploy with policies)
    bashrc → /home/coder/.bashrc (policy: default)
    gitconfig → /home/coder/.gitconfig (policy: replace)
    ...
   ↓
12. Install packages (batch by package manager)
    apt: 42 packages
    npm: 8 packages
    custom: 3 installers
   ↓
13. Tag snapshot as :good (successful sync)
   ↓
14. Cleanup old snapshots (retention policy)
   ↓
15. Release lock
   ↓
16. Service exits (exit 0)
```

**Duration**: Typical sync takes 10-60 seconds after first boot (first boot: 5-15 minutes for package installation).

### Component Interaction

```
/etc/config-manager/config.env
  ↓ (read by)
config-sync.sh
  ├─→ snapshot-manager.sh (pre-sync, tag-good, cleanup)
  ├─→ conflict-detector.sh (checksum, compare, validate)
  ├─→ execute-scripts.sh (run *.sh files)
  ├─→ process-files.sh (deploy file triplets)
  └─→ handler-common.sh (orchestrate package managers)
      ├─→ handler-apt.sh
      ├─→ handler-apk.sh
      ├─→ handler-dnf.sh
      ├─→ handler-npm.sh
      ├─→ handler-pip.sh
      └─→ handler-custom.sh

/opt/config-manager/repo (git clone)
  └─→ infra/lxc/templates/*/container-configs/
      ├─→ scripts/ (executed by execute-scripts.sh)
      ├─→ files/ (processed by process-files.sh)
      └─→ packages/ (installed by handler-*.sh)

/var/lib/config-manager/state/ (conflict detection state)
  ├─→ checksums.prev (last successful sync)
  ├─→ checksums.current (this sync, pre-pull)
  ├─→ conflicts.log (conflict details)
  └─→ managed-files.list (registry of managed files)

/var/log/config-manager/sync.log (operation log)
```

---

## Configuration File

### Location: `/etc/config-manager/config.env`

This file controls all aspects of config-manager behavior. It's created during installation and can be edited manually.

**Format**: Bash variable assignments (sourced by config-sync.sh)

```bash
# /etc/config-manager/config.env
CONFIG_REPO_URL="https://github.com/kethalia/infrahaus.git"
CONFIG_BRANCH="main"
CONFIG_PATH="infra/lxc/templates/web3-dev/container-configs"
CONFIG_HELPER_PATH="infra/lxc/scripts/config-manager"
CONFIG_CONTAINER_USER="coder"
SNAPSHOT_ENABLED="auto"
SNAPSHOT_RETENTION_DAYS="7"
SNAPSHOT_BACKEND="auto"
LVM_SNAPSHOT_SIZE="1G"
```

### Git Repository Settings

#### CONFIG_REPO_URL

**Required**: Yes  
**Description**: Git clone URL for the configuration repository  
**Format**: HTTPS or SSH URL  
**Example**:

```bash
# HTTPS (recommended for public repos)
CONFIG_REPO_URL="https://github.com/kethalia/infrahaus.git"

# SSH (for private repos with key authentication)
CONFIG_REPO_URL="git@github.com:kethalia/infrahaus.git"

# Self-hosted GitLab
CONFIG_REPO_URL="https://gitlab.example.com/infra/configs.git"
```

**Notes**:

- HTTPS URLs require no authentication for public repos
- SSH URLs require SSH key setup (deploy keys or user keys)
- First boot will `git clone`, subsequent boots will `git pull`

#### CONFIG_BRANCH

**Required**: No  
**Default**: `main`  
**Description**: Git branch to track  
**Example**:

```bash
# Production environment
CONFIG_BRANCH="main"

# Staging environment
CONFIG_BRANCH="staging"

# Feature testing
CONFIG_BRANCH="feature/new-tools"
```

**Use cases**:

- **Multi-environment setups**: Use different branches per environment (dev, staging, prod)
- **Feature testing**: Test new configs before merging to main
- **Rollback**: Switch to a known-good branch

#### CONFIG_PATH

**Required**: No  
**Default**: Set by template in `template.conf`  
**Description**: Relative path within the repository to `container-configs/`  
**Example**:

```bash
# Template-specific configs (default)
CONFIG_PATH="infra/lxc/templates/web3-dev/container-configs"

# Shared configs
CONFIG_PATH="shared/configs"

# Custom structure
CONFIG_PATH="my-custom-path/configs"
```

**Directory structure expected**:

```
$CONFIG_REPO_URL/$CONFIG_PATH/
├── scripts/
├── files/
└── packages/
```

#### CONFIG_HELPER_PATH

**Required**: No  
**Default**: `infra/lxc/scripts/config-manager`  
**Description**: Relative path within the repository to helper scripts  
**Example**:

```bash
# Default location (recommended)
CONFIG_HELPER_PATH="infra/lxc/scripts/config-manager"

# Custom location
CONFIG_HELPER_PATH="my-scripts/config-manager"
```

**Purpose**: Config-manager uses this path to locate and download helper scripts on first boot or when they're missing. The service automatically downloads:

- `config-manager-helpers.sh` - Shared utility functions
- `execute-scripts.sh` - Script execution engine
- `process-files.sh` - File deployment engine
- `snapshot-manager.sh` - Snapshot system
- `conflict-detector.sh` - Conflict detection
- `package-handlers/` - Package manager handlers (apt, npm, pip, custom, etc.)

**Self-healing**: If helper scripts are missing or corrupted, config-manager automatically re-downloads them from the configured repository path on next sync.

**Directory structure expected**:

```
$CONFIG_REPO_URL/$CONFIG_HELPER_PATH/
├── config-manager-helpers.sh
├── execute-scripts.sh
├── process-files.sh
├── snapshot-manager.sh
├── conflict-detector.sh
└── package-handlers/
    ├── handler-common.sh
    ├── handler-apt.sh
    ├── handler-apk.sh
    ├── handler-dnf.sh
    ├── handler-npm.sh
    ├── handler-pip.sh
    └── handler-custom.sh
```

### Snapshot Settings

#### SNAPSHOT_ENABLED

**Required**: No  
**Default**: `auto`  
**Options**: `auto`, `yes`, `no`  
**Description**: Enable snapshot system

| Value  | Behavior                             |
| ------ | ------------------------------------ |
| `auto` | Enable if supported backend detected |
| `yes`  | Always enable (fail if no backend)   |
| `no`   | Disable snapshots (not recommended)  |

**Example**:

```bash
# Auto-detect (recommended)
SNAPSHOT_ENABLED="auto"

# Force enable (fail fast if snapshots unavailable)
SNAPSHOT_ENABLED="yes"

# Disable (testing only, not recommended for production)
SNAPSHOT_ENABLED="no"
```

**When to disable**:

- Testing config-manager in a disposable container
- Using external backup solution
- Limited disk space (but consider file-level fallback)

#### SNAPSHOT_RETENTION_DAYS

**Required**: No  
**Default**: `7`  
**Description**: Number of days to keep snapshots before automatic cleanup  
**Example**:

```bash
# Keep 7 days (default)
SNAPSHOT_RETENTION_DAYS="7"

# Keep 30 days (longer rollback window)
SNAPSHOT_RETENTION_DAYS="30"

# Keep 1 day (aggressive cleanup, more disk space)
SNAPSHOT_RETENTION_DAYS="1"

# Keep forever (manual cleanup only)
SNAPSHOT_RETENTION_DAYS="0"
```

**Disk space considerations**:

- **ZFS**: Snapshots are copy-on-write, minimal space until files change
- **LVM**: Snapshots consume space from the volume group
- **BTRFS**: Similar to ZFS, efficient copy-on-write
- **File-level**: Full copy of managed files (most space-consuming)

#### SNAPSHOT_BACKEND

**Required**: No  
**Default**: `auto`  
**Options**: `auto`, `zfs`, `lvm`, `btrfs`, `none`  
**Description**: Snapshot backend to use

| Value   | Behavior                                     |
| ------- | -------------------------------------------- |
| `auto`  | Auto-detect (ZFS > LVM > BTRFS > file-level) |
| `zfs`   | Force ZFS (fail if not available)            |
| `lvm`   | Force LVM (fail if not available)            |
| `btrfs` | Force BTRFS (fail if not available)          |
| `none`  | Use file-level backups                       |

**Example**:

```bash
# Auto-detect (recommended)
SNAPSHOT_BACKEND="auto"

# Force specific backend
SNAPSHOT_BACKEND="zfs"

# Force file-level backups (slower but universal)
SNAPSHOT_BACKEND="none"
```

#### LVM_SNAPSHOT_SIZE

**Required**: No  
**Default**: `1G`  
**Description**: LVM snapshot size (LVM backend only)  
**Format**: Size with unit (M for megabytes, G for gigabytes)  
**Example**:

```bash
# 1 GB (default, suitable for most configs)
LVM_SNAPSHOT_SIZE="1G"

# 2 GB (if many files change frequently)
LVM_SNAPSHOT_SIZE="2G"

# 500 MB (minimal space, small configs only)
LVM_SNAPSHOT_SIZE="500M"
```

**Sizing guidelines**:

- Start with 1G
- Monitor `lvs` output for snapshot usage (`lvs -o +snap_percent`)
- If snapshot fills (100%), increase size
- Size = (expected changes between syncs) × 2

### Container User

#### CONFIG_CONTAINER_USER

**Required**: No  
**Default**: Auto-detected (first non-root user with UID ≥ 1000)  
**Description**: Username for file ownership and script environment  
**Example**:

```bash
# Auto-detect (default)
# CONFIG_CONTAINER_USER is unset or empty

# Explicit user
CONFIG_CONTAINER_USER="coder"

# Different user
CONFIG_CONTAINER_USER="developer"
```

**Auto-detection logic**:

```bash
# From config-manager-helpers.sh
awk -F: '$3 >= 1000 && $3 < 60000 && $1 !~ /^(nobody|ubuntu)$/ {print $1; exit}' /etc/passwd
```

**Use cases for explicit setting**:

- Multiple non-root users in container
- User created after config-manager installation
- Non-standard UID ranges

---

## Script Execution

### Directory Structure

Scripts are stored in the `scripts/` subdirectory within your `container-configs/`:

```
container-configs/
└── scripts/
    ├── 00-pre-checks.sh       # Pre-flight validation
    ├── 01-setup-user.sh       # User creation
    ├── 02-docker-install.sh   # Docker installation
    ├── 03-nodejs-setup.sh     # Node.js and PNPM
    ├── 04-web3-tools.sh       # Foundry, Hardhat
    ├── 05-shell-setup.sh      # Starship prompt
    ├── 06-dev-tools.sh        # Misc development tools
    ├── 50-vscode-server.sh    # VS Code Server
    └── 99-post-setup.sh       # Final checks
```

### Naming and Ordering

**Convention**: `NN-descriptive-name.sh`

- **NN**: Two-digit numeric prefix (00-99)
- **descriptive-name**: Lowercase, hyphen-separated description
- **.sh**: Shell script extension

**Execution order**: Alphabetical using `LC_ALL=C sort`

```bash
00-pre-checks.sh        # First
01-setup-user.sh
02-docker-install.sh
...
98-final-cleanup.sh
99-post-setup.sh        # Last
```

**Prefix ranges** (convention):

| Range | Purpose                         | Examples                                        |
| ----- | ------------------------------- | ----------------------------------------------- |
| 00-09 | Pre-flight, validation          | 00-pre-checks.sh, 01-setup-user.sh              |
| 10-39 | Core system setup               | 10-system-packages.sh, 20-security-hardening.sh |
| 40-69 | Application installation        | 50-vscode-server.sh, 60-database-tools.sh       |
| 70-89 | Configuration and customization | 70-shell-config.sh, 80-git-setup.sh             |
| 90-99 | Post-setup, verification        | 90-cleanup.sh, 99-post-setup.sh                 |

**Important**: Scripts are executed **sequentially**, not in parallel. Design for this.

### Execution Behavior

#### Sequential Execution

Scripts run one at a time in order. Each script is **sourced** (not executed) in a subshell, which means:

- Scripts inherit all environment variables and helper functions
- Use `return` instead of `exit` to terminate with error codes
- Changes to the current directory or variables affect only the subshell
- All exported environment variables persist for subsequent scripts

```bash
# execute-scripts.sh logic (simplified)
for script in $(ls *.sh | LC_ALL=C sort); do
    if ! (source "$script"); then
        log_error "Script $script failed (exit $?)"
        exit 1
    fi
done
```

**Implication**:

- Scripts can use `return 0` for success, `return 1` for failure
- Helper functions (`is_installed`, `log_info`, etc.) are directly available
- Scripts don't need shebangs, but can include them for standalone testing
- Design scripts to be independent but assume prior scripts have succeeded

#### Auto-Executable

Scripts are automatically made executable if missing the +x bit:

```bash
chmod +x "$script"
source "$script"
```

**Best practice**:

- Set executable bit in git (`git add --chmod=+x script.sh`) for clarity
- Include shebang (`#!/usr/bin/env bash`) for standalone testing
- Use `return` instead of `exit` to avoid terminating the parent shell

#### Idempotency

Scripts should be **idempotent** — running multiple times produces the same result.

**Bad** (not idempotent):

```bash
# This will create duplicate entries on each run
echo "export PATH=\$PATH:/opt/bin" >> ~/.bashrc
```

**Good** (idempotent):

```bash
# Check before adding
if ! grep -q "/opt/bin" ~/.bashrc; then
    echo "export PATH=\$PATH:/opt/bin" >> ~/.bashrc
fi
```

**Pattern**: Check → Skip if done → Do if not done

#### Error Handling

Scripts should use `set -euo pipefail` for safety:

```bash
#!/usr/bin/env bash
set -euo pipefail  # Exit on error, undefined variable, pipe failure
```

**Exit codes**:

- `0`: Success (continue to next script)
- Non-zero: Failure (abort sync, rollback snapshot)

### Environment Variables

All scripts have access to these environment variables:

| Variable                   | Example Value                                    | Description                                                |
| -------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| `CONFIG_MANAGER_VERSION`   | `0.4.0`                                          | Config-manager version                                     |
| `CONFIG_MANAGER_ROOT`      | `/opt/config-manager/repo`                       | Git repository root                                        |
| `CONFIG_MANAGER_LOG`       | `/var/log/config-manager/sync.log`               | Log file path                                              |
| `CONFIG_MANAGER_FIRST_RUN` | `true` / `false`                                 | First run detection                                        |
| `CONTAINER_OS`             | `ubuntu`                                         | Detected OS (ubuntu, debian, alpine, fedora, rhel, centos) |
| `CONTAINER_OS_VERSION`     | `24.04`                                          | OS version                                                 |
| `CONTAINER_USER`           | `coder`                                          | Primary non-root user                                      |
| `_PKG_MGR`                 | `apt`                                            | Detected package manager (apt, apk, dnf, yum)              |
| `REPO_DIR`                 | `/opt/config-manager/repo`                       | Alias for CONFIG_MANAGER_ROOT                              |
| `CONFIG_PATH`              | `infra/lxc/templates/web3-dev/container-configs` | Config subdirectory                                        |

**Usage in scripts**:

```bash
#!/usr/bin/env bash
set -euo pipefail

log_info "Running on $CONTAINER_OS $CONTAINER_OS_VERSION"
log_info "User: $CONTAINER_USER"

if [[ "$CONFIG_MANAGER_FIRST_RUN" == "true" ]]; then
    log_info "This is the first run — performing initial setup"
else
    log_info "Subsequent run — checking for updates"
fi
```

### Helper Functions

Config-manager provides helper functions to simplify common tasks. These are sourced from `config-manager-helpers.sh`.

#### is_installed

**Description**: Check if a command is available  
**Returns**: 0 if command exists, 1 if not  
**Example**:

```bash
if is_installed docker; then
    log_info "Docker is already installed"
    exit 0
fi

log_info "Docker not found — installing"
```

#### ensure_installed

**Description**: Install a package if the command doesn't exist  
**Arguments**: Package name  
**Example**:

```bash
# Ensure curl is installed
ensure_installed curl

# Ensure multiple packages
ensure_installed git
ensure_installed wget
ensure_installed jq
```

**Implementation**:

```bash
ensure_installed() {
    local pkg="$1"
    if ! is_installed "$pkg"; then
        log_info "Installing $pkg..."
        $_PKG_MGR install -y "$pkg"
    fi
}
```

#### log_info, log_warn, log_error

**Description**: Structured logging with timestamps  
**Arguments**: Log message  
**Output**: Writes to both stdout and `/var/log/config-manager/sync.log`  
**Example**:

```bash
log_info "Starting Docker installation"
log_warn "Docker Compose plugin not found"
log_error "Failed to start Docker daemon"
```

**Format**:

```
[2026-02-03 14:30:22] [INFO   ] Starting Docker installation
[2026-02-03 14:30:23] [WARNING] Docker Compose plugin not found
[2026-02-03 14:30:24] [ERROR  ] Failed to start Docker daemon
```

### Writing Scripts

#### Template Script

Use this template as a starting point:

```bash
#!/usr/bin/env bash
# NN-descriptive-name.sh — Brief description of what this script does

set -euo pipefail

log_info "=== Starting [Task Name] ==="

# Check if already done (idempotency)
if is_installed <command>; then
    log_info "Already installed — skipping"
    exit 0
fi

# Perform installation or configuration
log_info "Installing [tool/package]..."

if <installation command>; then
    log_info "✓ Installation successful"
else
    log_error "Installation failed"
    exit 1
fi

# Verification
if is_installed <command>; then
    VERSION=$(<command> --version)
    log_info "Verified: ${VERSION}"
else
    log_error "Verification failed"
    exit 1
fi

log_info "=== [Task Name] Complete ==="
```

#### Real Example: Docker Installation

From `infra/lxc/templates/web3-dev/container-configs/scripts/02-docker-install.sh`:

```bash
#!/usr/bin/env bash
# 02-docker-install.sh — Install Docker CE with Compose and BuildX

set -euo pipefail

log_info "=== Installing Docker CE ==="

# Idempotency check
if is_installed docker; then
    DOCKER_VERSION=$(docker --version 2>/dev/null || echo "unknown")
    log_info "Docker is already installed: ${DOCKER_VERSION}"

    # Verify group membership
    if groups "$CONTAINER_USER" | grep -q docker; then
        log_info "✓ User '$CONTAINER_USER' is already in docker group"
    else
        log_info "Adding '$CONTAINER_USER' to docker group..."
        usermod -aG docker "$CONTAINER_USER"
    fi

    exit 0
fi

log_info "Docker not found. Installing Docker CE..."

# Install prerequisites
ensure_installed ca-certificates
ensure_installed curl
ensure_installed gnupg

# Run official Docker installation script
if curl -fsSL https://get.docker.com | sh; then
    log_info "✓ Docker CE installed successfully"
else
    log_error "Failed to install Docker CE"
    exit 1
fi

# Add user to docker group
usermod -aG docker "$CONTAINER_USER"

# Enable and start service
systemctl enable docker
systemctl start docker

log_info "=== Docker CE Installation Complete ==="
```

**Key patterns**:

1. ✅ Clear logging with section markers
2. ✅ Idempotency check at start
3. ✅ Use helper functions (`is_installed`, `ensure_installed`, `log_*`)
4. ✅ Error handling with exit codes
5. ✅ Verification after installation
6. ✅ User feedback with checkmarks (✓)

#### Best Practices

1. **Start with idempotency check**: Skip if already done
2. **Use helper functions**: Leverage `is_installed`, `ensure_installed`, `log_*`
3. **Handle errors explicitly**: Check command exit codes
4. **Log verbosely**: Users watch logs during first boot
5. **Test in isolation**: Run script manually before committing
6. **Comment complex logic**: Explain non-obvious decisions
7. **Use variables for paths**: Avoid hardcoded paths
8. **Verify after changes**: Confirm the action succeeded

---

## File Management

File management allows you to deploy configuration files from git to specific locations in the container with conflict resolution policies.

### File Triplet Format

For each file you want to manage, create **three files**:

1. **Content file**: The actual file content
2. **Path file** (`.path`): Target location (one line)
3. **Policy file** (`.policy`): Conflict resolution policy (one line)

**Example**: Deploy custom `.bashrc` to `/home/coder`

```
container-configs/files/
├── .bashrc          # Content: PS1, aliases, exports
├── .bashrc.path     # Target: /home/coder
└── .bashrc.policy   # Policy: default
```

**Content of `.bashrc.path`**:

```
/home/coder
```

**Content of `.bashrc.policy`**:

```
default
```

**Result**: File deploys to `/home/coder/.bashrc`.

**Important**: The deployed filename matches the source filename exactly (no automatic renaming or dot-prefixing). To deploy a dotfile like `.bashrc`, name the source file `.bashrc` in your repository.

### Policies

Config-manager supports three policies for handling existing files:

| Policy    | Target Exists? | Action                                             |
| --------- | -------------- | -------------------------------------------------- |
| `replace` | Yes            | **Overwrite** (always update from git)             |
| `replace` | No             | Copy to target                                     |
| `default` | Yes            | **Skip** (preserve user changes)                   |
| `default` | No             | Copy to target                                     |
| `backup`  | Yes            | Move to `<name>.backup-YYYYMMDD-HHMMSS`, then copy |
| `backup`  | No             | Copy to target                                     |

#### Policy: `replace`

**Use when**: File should always match git (no user edits expected)

**Examples**:

- System configuration files (`/etc/nginx/nginx.conf`)
- Application configs managed by automation
- Shared team settings

**Behavior**:

```bash
# File exists and differs from git → Overwrite
if [[ -f /target/.bashrc ]] && sha256sum differs; then
    cp bashrc /target/.bashrc
fi

# File exists and matches git → Skip (no-op)

# File doesn't exist → Copy
cp bashrc /target/.bashrc
```

#### Policy: `default`

**Use when**: Provide default, but respect user customizations

**Examples**:

- Shell configs (`.bashrc`, `.zshrc`) — users may personalize
- Editor configs (`.vimrc`) — personal preferences
- Git config (`.gitconfig`) — user name/email

**Behavior**:

```bash
# File exists (regardless of content) → Skip (preserve user changes)
if [[ -f /target/.bashrc ]]; then
    log_info "Skipped (policy: default, file exists)"
    exit 0
fi

# File doesn't exist → Copy
cp bashrc /target/.bashrc
```

**Result**: First deployment succeeds, subsequent syncs skip (user owns the file).

#### Policy: `backup`

**Use when**: Update is important, but preserve user's version

**Examples**:

- Major config format change (backup old version)
- Database config migration (preserve old for rollback)
- Config file with user data (backup before updating)

**Behavior**:

```bash
# File exists and differs → Backup then copy
if [[ -f /target/.bashrc ]] && sha256sum differs; then
    mv /target/.bashrc /target/.bashrc.backup-20260203-143022
    cp bashrc /target/.bashrc
    log_info "Backed up old version to .bashrc.backup-20260203-143022"
fi

# File exists and matches → Skip

# File doesn't exist → Copy
cp bashrc /target/.bashrc
```

### Processing Logic

File processing follows this algorithm:

1. **Read `.path` file** (fail if missing)
2. **Read `.policy` file** (default to `default` if missing)
3. **Ensure target directory exists** (`mkdir -p`)
4. **Compute checksums** (SHA-256 of source and target)
5. **Skip if identical** (no changes needed)
6. **Apply policy**:
   - `replace`: Overwrite
   - `default`: Skip if exists
   - `backup`: Backup then overwrite
7. **Set ownership** (match parent directory owner)
8. **Log action** (deployed, skipped, backed up)

**Checksum comparison**:

```bash
SOURCE_SHA=$(sha256sum "bashrc" | awk '{print $1}')
TARGET_SHA=$(sha256sum "/home/coder/.bashrc" | awk '{print $1}')

if [[ "$SOURCE_SHA" == "$TARGET_SHA" ]]; then
    log_info "Skipped (no changes)"
    exit 0
fi
```

**Ownership inheritance**:

```bash
# Get parent directory owner
PARENT_DIR="/home/coder"
OWNER=$(stat -c '%U:%G' "$PARENT_DIR")

# Set ownership to match
chown "$OWNER" "$TARGET_FILE"
```

### Real-World Examples

#### Example 1: System Config (Always Replace)

**Use case**: Nginx config managed by git, no manual edits allowed

**Files**:

```bash
# nginx.conf
user www-data;
worker_processes auto;
...

# nginx.conf.path
/etc/nginx

# nginx.conf.policy
replace
```

**Behavior**:

- First run: Deploys `/etc/nginx/nginx.conf`
- Subsequent runs: Always updates from git (overwrites local changes)
- User edits are lost on next sync (intentional — edit in git)

#### Example 2: User Config (Preserve Customizations)

**Use case**: Default `.bashrc`, but users can customize

**Files**:

```bash
# bashrc
export PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
alias ll='ls -lah'
alias gs='git status'

# bashrc.path
/home/coder

# bashrc.policy
default
```

**Behavior**:

- First run: Deploys `/home/coder/.bashrc` with defaults
- User customizes: Adds personal aliases, exports
- Subsequent runs: **Skips** (respects user changes)
- User wants to revert: Delete file, next sync redeploys

#### Example 3: Config Migration (Backup Old)

**Use case**: Upgrading config format, keep old version for rollback

**Files**:

```bash
# database.yml
# New format (version 2)
database:
  adapter: postgresql
  host: localhost
  ...

# database.yml.path
/etc/myapp

# database.yml.policy
backup
```

**Behavior**:

- First run: Deploys `/etc/myapp/database.yml`
- Config updated in git: New format
- Next run:
  - Moves `/etc/myapp/database.yml` → `/etc/myapp/database.yml.backup-20260203-143022`
  - Deploys new version from git
- Rollback: `mv database.yml.backup-* database.yml`

#### Example 4: Multiple Variants

**Use case**: Deploy different files to different locations

```
files/
├── bashrc.user           # User's default bashrc
├── bashrc.user.path      # → /home/coder
├── bashrc.user.policy    # → default
├── bashrc.root           # Root's bashrc (minimal)
├── bashrc.root.path      # → /root
└── bashrc.root.policy    # → replace
```

**Naming convention**: Use dots for variants (`bashrc.user`, `bashrc.root`)

---

## Package Management

Package management allows you to declaratively specify packages to install from multiple package managers.

### Supported Package Managers

| Manager    | Extension | Distributions               | Check Installed       | Install Command            |
| ---------- | --------- | --------------------------- | --------------------- | -------------------------- |
| **APT**    | `.apt`    | Debian, Ubuntu              | `dpkg-query -W <pkg>` | `apt-get install -y <pkg>` |
| **APK**    | `.apk`    | Alpine                      | `apk info -e <pkg>`   | `apk add <pkg>`            |
| **DNF**    | `.dnf`    | RHEL, Fedora, CentOS Stream | `rpm -q <pkg>`        | `dnf install -y <pkg>`     |
| **NPM**    | `.npm`    | All (requires Node.js)      | `npm list -g --json`  | `npm install -g <pkg>`     |
| **PIP**    | `.pip`    | All (requires Python)       | `pip show <pkg>`      | `pip install <pkg>`        |
| **Custom** | `.custom` | All                         | User-defined check    | User-defined install       |

**Directory**: `container-configs/packages/`

**Naming**: Descriptive name with extension (e.g., `base.apt`, `web3-tools.custom`)

### Package File Format

**Format**: One package per line, `#` for comments

```bash
# Base system packages
curl              # HTTP client
git               # Version control
wget              # File downloader
vim               # Text editor
htop              # Process monitor
build-essential   # Compiler toolchain

# Comments and blank lines are ignored

# Inline comments supported
nodejs=24.*       # APT: Pin to Node.js 24.x
```

**Features**:

- **Comments**: Lines starting with `#` or `//`
- **Inline comments**: Text after `#` on package line
- **Whitespace trimming**: Leading/trailing spaces ignored
- **Blank lines**: Ignored
- **Case-sensitive**: Package names are case-sensitive

### Version Pinning

#### APT (Debian/Ubuntu)

**Syntax**: `package=version-pattern`

```bash
# Exact version
nodejs=24.0.0-1ubuntu1

# Glob pattern (any 24.x version)
nodejs=24.*

# Epoch notation (Docker)
docker-ce=5:20.10.7~3-0~ubuntu-focal
```

**Finding available versions**:

```bash
apt-cache madison nodejs
```

#### DNF (RHEL/Fedora)

**Syntax**: `package-version` (dash separator)

```bash
# Exact version
nodejs-24.0.0

# Latest from specific repo
nodejs-24.0.0.el9
```

**Finding available versions**:

```bash
dnf --showduplicates list nodejs
```

#### NPM (Global)

**Syntax**: Standard npm semver

```bash
# Exact version
typescript@5.0.0

# Caret (compatible with 5.x)
eslint@^8.0.0

# Tilde (patch versions only)
prettier@~2.8.0

# Latest
pnpm@latest
```

**Finding available versions**:

```bash
npm view typescript versions
```

#### PIP (Python)

**Syntax**: PEP 440 version specifiers

```bash
# Exact version
requests==2.28.0

# Minimum version
django>=4.0

# Range
requests>=2.28,<3.0

# Compatible release
requests~=2.28.0
```

**Finding available versions**:

```bash
pip index versions requests
```

### Custom Installers

For software not available in standard package managers (e.g., Foundry, GitHub CLI), use custom installers.

**Format**: Pipe-delimited fields

```
name|check_command|install_command[|timeout_seconds]
```

**Fields**:

| Field             | Required | Description                                        | Example                                                     |
| ----------------- | -------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `name`            | Yes      | Package name (for logging)                         | `foundry`                                                   |
| `check_command`   | Yes      | Command to check if installed (exit 0 = installed) | `command -v forge`                                          |
| `install_command` | Yes      | Command to install                                 | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| `timeout_seconds` | No       | Timeout in seconds (default: 300)                  | `600`                                                       |

#### Example: Foundry

```bash
foundry|command -v forge|curl -L https://foundry.paradigm.xyz | bash && foundryup|600
```

**Explanation**:

1. **Name**: `foundry` (displayed in logs)
2. **Check**: `command -v forge` (exits 0 if forge exists)
3. **Install**: Download and run Foundry installer, then run `foundryup`
4. **Timeout**: 600 seconds (10 minutes)

#### Example: GitHub CLI

```bash
gh|command -v gh|curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list && sudo apt update && sudo apt install -y gh
```

**Note**: Long install commands are supported (no line length limit).

#### Example: PNPM

```bash
pnpm|command -v pnpm|npm install -g pnpm|30
```

**Features**:

- **Pre-check**: `check_command` runs before installing (skip if already installed)
- **Post-check**: `check_command` runs after installing (verify success)
- **Timeout enforcement**: Uses GNU `timeout` command
- **Continue on failure**: Failed installers don't block others
- **Detailed logging**: Shows stdout/stderr (truncated if long)

#### Real Example from web3-dev

From `infra/lxc/templates/web3-dev/container-configs/packages/cli.custom`:

```bash
# Foundry (Solidity development framework)
foundry|command -v forge|curl -L https://foundry.paradigm.xyz | bash && source ~/.bashrc && foundryup|600

# GitHub CLI
gh|command -v gh|curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list && sudo apt update && sudo apt install -y gh|300

# Starship prompt
starship|command -v starship|curl -fsSL https://starship.rs/install.sh | sh -s -- -y|120
```

### Processing Behavior

#### Execution Order

1. **Update package index** (once per package manager)
   - APT: `apt-get update`
   - DNF: `dnf makecache`
   - APK: `apk update`
2. **Parse package files** (strip comments, validate format)
3. **Check installed packages** (filter out already installed)
4. **Batch install** (all missing packages in one command)
5. **Log results** (installed/skipped/failed counts)

#### Batch Installation

Packages are installed in **batches** for efficiency:

```bash
# Instead of:
apt-get install -y curl
apt-get install -y git
apt-get install -y wget

# Config-manager does:
apt-get install -y curl git wget
```

**Benefits**:

- Faster (single apt transaction)
- Better dependency resolution
- Fewer package index reads

#### Failure Handling

- **Missing packages**: Logged as warnings, installation continues
- **Failed installations**: Logged as errors, counted in summary
- **Custom installer failures**: Logged with stdout/stderr, continue to next

**Summary output**:

```
[INFO] Package installation summary:
[INFO]   Installed: 42 packages
[INFO]   Skipped: 8 packages (already installed)
[INFO]   Failed: 1 package (see errors above)
```

---

## Snapshot System

The snapshot system provides automatic backup before each configuration sync, enabling instant rollback if something goes wrong.

### Supported Backends

Config-manager supports four snapshot backends (auto-detected in priority order):

| Backend        | Priority     | Filesystem      | Snapshot Type       | Space Efficiency    |
| -------------- | ------------ | --------------- | ------------------- | ------------------- |
| **ZFS**        | 1            | ZFS             | Native ZFS snapshot | Excellent (CoW)     |
| **LVM**        | 2            | LVM2 thin/thick | LVM snapshot        | Good (CoW for thin) |
| **BTRFS**      | 3            | BTRFS           | Subvolume snapshot  | Excellent (CoW)     |
| **File-level** | 4 (fallback) | Any             | Copy managed files  | Poor (full copy)    |

#### ZFS

**Detection**:

```bash
# Check if root filesystem is ZFS
findmnt -n -o FSTYPE / | grep -q zfs
```

**Snapshot command**:

```bash
# Snapshot dataset
zfs snapshot tank/lxc/100@config-manager-20260203-143022
```

**Features**:

- ✅ Instant snapshot creation (milliseconds)
- ✅ Copy-on-write (minimal space until files change)
- ✅ Atomic rollback
- ✅ Space-efficient

**Restore**:

```bash
zfs rollback tank/lxc/100@config-manager-20260203-143022
```

#### LVM

**Detection**:

```bash
# Check if root is an LVM logical volume
lvs --noheadings -o lv_path "$(findmnt -n -o SOURCE /)"
```

**Snapshot command**:

```bash
# Create snapshot with specified size
lvcreate -s -n config-manager-20260203-143022 -L 1G /dev/vg0/root
```

**Features**:

- ✅ Widely supported (default on many distros)
- ⚠️ Requires pre-allocated space (see `LVM_SNAPSHOT_SIZE`)
- ⚠️ Snapshot can fill (monitor with `lvs -o +snap_percent`)

**Restore**:

```bash
# Merge snapshot (restores on next reboot)
lvconvert --merge /dev/vg0/config-manager-20260203-143022
reboot
```

#### BTRFS

**Detection**:

```bash
# Check if root filesystem is BTRFS
findmnt -n -o FSTYPE / | grep -q btrfs
```

**Snapshot command**:

```bash
# Create read-only snapshot
btrfs subvolume snapshot -r / /.snapshots/config-manager-20260203-143022
```

**Features**:

- ✅ Copy-on-write (space-efficient)
- ✅ Fast snapshot creation
- ⚠️ Less mature than ZFS

**Restore**:

```bash
# Restore from snapshot (requires boot from live system or special boot entry)
btrfs subvolume snapshot /.snapshots/config-manager-20260203-143022 /
```

#### File-level Backup (Fallback)

**When used**: No native filesystem snapshot support detected

**What's backed up**:

- All managed files (from `files/` triplets)
- Config-manager state directory (`/var/lib/config-manager/state/`)

**Backup structure**:

```
/var/lib/config-manager/backups/config-manager-20260203-143022/
├── MANIFEST          # List of backed-up files
├── METADATA          # Snapshot metadata (created timestamp, file count)
├── STATUS            # "good" marker for successful syncs
├── files/            # Backed-up managed files
│   ├── home/
│   │   └── coder/
│   │       ├── .bashrc
│   │       ├── .bash_aliases
│   │       └── .gitconfig
│   └── etc/
│       └── nginx/
│           └── nginx.conf
└── state/            # Config-manager state backup
    ├── checksums.prev
    ├── checksums.current
    └── managed-files.list
```

**Features**:

- ✅ Works on any filesystem
- ⚠️ Space-inefficient (full copy)
- ⚠️ Slower (copy time proportional to file count/size)

**Restore**:

```bash
# Manually restore from backup
rsync -av /var/lib/config-manager/backups/config-manager-20260203-143022/files/ /
```

### Configuration

See [Snapshot Settings](#snapshot-settings) for `SNAPSHOT_ENABLED`, `SNAPSHOT_RETENTION_DAYS`, `SNAPSHOT_BACKEND`, `LVM_SNAPSHOT_SIZE`.

### Snapshot Lifecycle

#### 1. Pre-sync Snapshot Creation

Before every git pull, a snapshot is created:

```bash
# Call snapshot-manager.sh to create snapshot
/usr/local/lib/config-manager/snapshot-manager.sh create
```

**Naming format**: `config-manager-YYYYMMDD-HHMMSS`

**Example**: `config-manager-20260203-143022`

#### 2. Configuration Sync

Git pull, script execution, file processing, package installation.

#### 3. Snapshot Tagging (`:good`)

If sync succeeds, snapshot is tagged as "good":

```bash
# ZFS example
zfs snapshot tank/lxc/100@config-manager-20260203-143022:good

# File-level example
touch /var/lib/config-manager/backups/config-manager-20260203-143022/STATUS
echo "good" > /var/lib/config-manager/backups/config-manager-20260203-143022/STATUS
```

**Purpose**: Mark snapshots that represent successful, known-good configurations.

#### 4. Cleanup (Retention Policy)

Snapshots older than `SNAPSHOT_RETENTION_DAYS` are automatically deleted:

```bash
# Clean up snapshots older than 7 days
/usr/local/lib/config-manager/snapshot-manager.sh cleanup
```

**Retention logic**:

```bash
# Calculate cutoff date
CUTOFF_DATE=$(date -d "-${SNAPSHOT_RETENTION_DAYS} days" +%s)

# For each snapshot
SNAPSHOT_DATE=$(date -d "${SNAPSHOT_TIMESTAMP}" +%s)
if [[ "$SNAPSHOT_DATE" -lt "$CUTOFF_DATE" ]]; then
    # Delete snapshot
fi
```

**Special case**: `SNAPSHOT_RETENTION_DAYS=0` means keep forever (manual cleanup only).

### Manual Commands

#### List Snapshots

```bash
# Using config-rollback CLI
config-rollback list

# Output:
# Available snapshots:
#   config-manager-20260203-143022:good  (2026-02-03 14:30:22) [good]
#   config-manager-20260202-090000:good  (2026-02-02 09:00:00) [good]
#   config-manager-20260201-120000       (2026-02-01 12:00:00)

# Or directly with snapshot-manager
/usr/local/lib/config-manager/snapshot-manager.sh list
```

#### Show Snapshot Details

```bash
config-rollback show config-manager-20260203-143022

# Output:
# Snapshot: config-manager-20260203-143022
# Created: 2026-02-03 14:30:22
# Status: good
# Backend: zfs
# Size: 245 MB (ZFS used space)
```

#### Create Manual Snapshot

```bash
# Create snapshot now (useful before manual changes)
/usr/local/lib/config-manager/snapshot-manager.sh create

# Or trigger a sync (creates snapshot automatically)
systemctl restart config-manager
```

#### Check Snapshot Status

```bash
/usr/local/lib/config-manager/snapshot-manager.sh status

# Output:
# Snapshot system: enabled
# Backend: zfs
# Last snapshot: config-manager-20260203-143022 (2 hours ago)
# Total snapshots: 7
# Retention: 7 days
```

---

## Conflict Detection

Conflict detection prevents config-manager from overwriting local changes that haven't been committed to git.

### How It Works

#### Phase 1: Pre-sync Checksum Computation

Before `git pull`, compute SHA-256 checksums of all managed files:

```bash
# For each file in managed-files.list
sha256sum /home/coder/.bashrc >> checksums.current
sha256sum /home/coder/.bash_aliases >> checksums.current
sha256sum /etc/nginx/nginx.conf >> checksums.current
```

**Stored in**: `/var/lib/config-manager/state/checksums.current`

#### Phase 2: Git Pull

```bash
cd /opt/config-manager/repo
git pull origin "$CONFIG_BRANCH"
```

**New file checksums**: Compute checksums of files in git repository.

#### Phase 3: Conflict Comparison

Compare three sets of checksums:

| Set          | Source              | Purpose                                 |
| ------------ | ------------------- | --------------------------------------- |
| **Previous** | `checksums.prev`    | Last successful sync (known-good state) |
| **Current**  | `checksums.current` | Before this sync (current state)        |
| **Git**      | Computed from repo  | New state from git                      |

**Conflict logic**:

```
For each managed file:
    IF (current != previous) AND (git != previous):
        # File changed locally AND in git → CONFLICT
        → Abort sync, log conflict
    ELSE IF (current != previous) AND (git == previous):
        # File changed locally but NOT in git → OK (respect local change)
        → Continue, skip file (based on policy)
    ELSE IF (current == previous) AND (git != previous):
        # File NOT changed locally but changed in git → OK (update from git)
        → Continue, apply update
    ELSE:
        # No changes → OK
        → Continue, skip (no-op)
```

#### Phase 4: Abort on Conflict

If any conflicts detected:

```bash
# Create conflict marker
cat > /var/lib/config-manager/CONFLICT <<EOF
conflict_detected=$(date '+%Y-%m-%d %H:%M:%S')
conflict_count=2
conflicts_log=/var/lib/config-manager/state/conflicts.log
EOF

# Exit with code 5
exit 5
```

**Result**: Sync aborted, snapshot preserved, no changes applied.

### State Files

Config-manager tracks state in `/var/lib/config-manager/state/`:

#### checksums.prev

**Format**: `<sha256>  <path>`

```
a3b2c1d4e5f6...  /home/coder/.bashrc
f6e5d4c3b2a1...  /home/coder/.bash_aliases
9876543210ab...  /etc/nginx/nginx.conf
```

**Updated**: After every successful sync (becomes the new baseline).

#### checksums.current

**Format**: Same as `checksums.prev`

**Created**: Before every git pull (snapshot of current state).

**Deleted**: After successful sync (only `.prev` is kept).

#### conflicts.log

**Format**: Human-readable conflict details

```
Conflict detected: /home/coder/.bashrc
  Previous: a3b2c1d4e5f6...
  Current:  b2c1d4e5f6a3...  (modified locally)
  Git:      c1d4e5f6a3b2...  (modified in git)
  → Resolution required: Edit manually or rollback

Conflict detected: /etc/nginx/nginx.conf
  Previous: 9876543210ab...
  Current:  8765432109ab...  (modified locally)
  Git:      7654321098ab...  (modified in git)
  → Resolution required: Edit manually or rollback
```

#### managed-files.list

**Format**: One file path per line

```
/home/coder/.bashrc
/home/coder/.bash_aliases
/home/coder/.gitconfig
/etc/nginx/nginx.conf
```

**Purpose**: Registry of all files managed by config-manager (used for checksum computation).

### Resolution Workflow

When conflicts are detected, you have two options:

#### Option A: Manual Resolution

**Steps**:

1. **Check conflict status**:

```bash
config-rollback status

# Output:
# Conflict detected: 2 file(s) have conflicting changes
# Conflicts log: /var/lib/config-manager/state/conflicts.log
#
# Conflicting files:
#   /home/coder/.bashrc
#   /etc/nginx/nginx.conf
```

2. **Review conflicts**:

```bash
cat /var/lib/config-manager/state/conflicts.log
```

3. **Manually resolve** (choose one):
   - **Keep local version**: Commit local changes to git
   - **Use git version**: Discard local changes, copy from git
   - **Merge**: Manually merge changes

4. **Mark as resolved**:

```bash
config-rollback resolve

# Output:
# Conflict marker removed
# Next sync will proceed normally
```

5. **Re-run sync**:

```bash
systemctl restart config-manager
```

#### Option B: Rollback to Snapshot

**Steps**:

1. **List snapshots**:

```bash
config-rollback list
```

2. **Restore previous snapshot**:

```bash
config-rollback restore config-manager-20260202-090000
```

3. **Verify**:

```bash
cat /home/coder/.bashrc  # Check file reverted
```

4. **Re-run sync** (will succeed now):

```bash
systemctl restart config-manager
```

**When to use**:

- Local changes were mistakes
- Want to start fresh from known-good state
- Faster than manual resolution

---

## CLI Tools

### config-rollback

**Location**: `/usr/local/bin/config-rollback`

**Description**: Unified CLI for snapshot management and conflict resolution.

#### Commands

##### list

**Description**: List all available snapshots

**Usage**:

```bash
config-rollback list
```

**Example output**:

```
Available snapshots:
  config-manager-20260203-143022:good  (2026-02-03 14:30:22) [good]
  config-manager-20260202-090000:good  (2026-02-02 09:00:00) [good]
  config-manager-20260201-120000       (2026-02-01 12:00:00)
  config-manager-20260131-180000:good  (2026-01-31 18:00:00) [good]
```

**Legend**:

- `:good` suffix = Successful sync (known-good configuration)
- No suffix = Snapshot created but sync not completed (may be mid-sync)

##### show

**Description**: Show detailed information about a snapshot

**Usage**:

```bash
config-rollback show <snapshot-name>
```

**Example**:

```bash
config-rollback show config-manager-20260203-143022

# Output:
# Snapshot: config-manager-20260203-143022
# Created: 2026-02-03 14:30:22
# Status: good
# Backend: zfs
# Dataset: tank/lxc/100
# Size: 245 MB
```

##### restore

**Description**: Restore from a snapshot (rollback)

**Usage**:

```bash
config-rollback restore <snapshot-name>
```

**Example**:

```bash
config-rollback restore config-manager-20260202-090000

# Output:
# Restoring snapshot: config-manager-20260202-090000
# Backend: zfs
# Executing: zfs rollback tank/lxc/100@config-manager-20260202-090000
# ✓ Snapshot restored successfully
# ⚠ Container will reboot to complete restoration
```

**Important**: ZFS/LVM rollback may require a reboot. File-level restores are immediate.

##### status

**Description**: Check conflict status and system health

**Usage**:

```bash
config-rollback status
```

**Example output (no conflicts)**:

```
✓ No conflicts detected
Last sync: 2026-02-03 14:30:22 (2 hours ago)
Last snapshot: config-manager-20260203-143022:good
Snapshot backend: zfs
Retention: 7 days
Total snapshots: 7
```

**Example output (conflicts detected)**:

```
✗ Conflict detected: 2 file(s) have conflicting changes
Conflicts log: /var/lib/config-manager/state/conflicts.log

Conflicting files:
  /home/coder/.bashrc
  /etc/nginx/nginx.conf

Resolution options:
  1. Manually resolve conflicts and run: config-rollback resolve
  2. Rollback to previous snapshot: config-rollback restore <snapshot-name>
```

##### resolve

**Description**: Mark conflicts as resolved (after manual fix)

**Usage**:

```bash
config-rollback resolve
```

**Example**:

```bash
# After manually editing conflicting files
vim /home/coder/.bashrc
git add /home/coder/.bashrc
git commit -m "Merge local changes"
git push

# Mark as resolved
config-rollback resolve

# Output:
# ✓ Conflict marker removed
# ✓ Next sync will proceed normally
# Run: systemctl restart config-manager
```

### snapshot-manager

**Location**: `/usr/local/lib/config-manager/snapshot-manager.sh`

**Description**: Low-level snapshot operations (usually called by config-sync, not manually).

#### Commands

##### create

**Description**: Create a new snapshot

**Usage**:

```bash
/usr/local/lib/config-manager/snapshot-manager.sh create
```

**Example output**:

```
[INFO] Creating snapshot: config-manager-20260203-153000
[INFO] Backend: zfs
[INFO] Dataset: tank/lxc/100
[INFO] Executing: zfs snapshot tank/lxc/100@config-manager-20260203-153000
[INFO] ✓ Snapshot created successfully
```

##### list

**Description**: List snapshots (same as `config-rollback list`)

##### tag-good

**Description**: Tag the last snapshot as `:good`

**Usage**:

```bash
/usr/local/lib/config-manager/snapshot-manager.sh tag-good
```

**Called by**: config-sync.sh after successful sync

##### cleanup

**Description**: Remove snapshots older than retention period

**Usage**:

```bash
/usr/local/lib/config-manager/snapshot-manager.sh cleanup
```

**Called by**: config-sync.sh after every sync

##### status

**Description**: Show snapshot system status

**Usage**:

```bash
/usr/local/lib/config-manager/snapshot-manager.sh status
```

---

## Service Management

Config-manager runs as a systemd service that executes on every boot.

### Systemd Service

**Location**: `/etc/systemd/system/config-manager.service`

**Service file**:

```ini
[Unit]
Description=LXC Configuration Manager - Git-based config sync
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/config-sync.sh
RemainAfterExit=no
StandardOutput=journal
StandardError=journal
SyslogIdentifier=config-manager

# Security
ProtectSystem=full
ReadWritePaths=/var/log/config-manager /opt/config-manager /etc/config-manager /var/lib/config-manager
RuntimeDirectory=config-manager
PrivateTmp=yes
NoNewPrivileges=yes
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
```

**Key settings**:

- **Type=oneshot**: Service runs once and exits (not a daemon)
- **After=network-online.target**: Wait for network before starting
- **TimeoutStartSec=300**: 5-minute timeout (adjust if slow package installation)
- **ProtectSystem=full**: Protects `/usr` and `/boot` from writes
- **ReadWritePaths**: Only these directories are writable

### Management Commands

#### Check Status

```bash
systemctl status config-manager

# Output:
# ● config-manager.service - LXC Configuration Manager - Git-based config sync
#    Loaded: loaded (/etc/systemd/system/config-manager.service; enabled; vendor preset: enabled)
#    Active: inactive (dead) since Mon 2026-02-03 14:30:30 UTC; 2h ago
#   Process: 1234 ExecStart=/usr/local/bin/config-sync.sh (code=exited, status=0/SUCCESS)
#  Main PID: 1234 (code=exited, status=0/SUCCESS)
```

**Status meanings**:

- **active (running)**: Currently syncing
- **inactive (dead)**: Last run completed successfully
- **failed**: Last run failed (check logs)

#### Manual Sync

```bash
# Trigger a sync manually
systemctl restart config-manager

# Or call directly (for testing)
sudo /usr/local/bin/config-sync.sh
```

#### View Logs

```bash
# Systemd journal (last 50 lines)
journalctl -u config-manager -n 50

# Follow logs in real-time
journalctl -u config-manager -f

# Sync log file
tail -f /var/log/config-manager/sync.log

# View all sync logs
cat /var/log/config-manager/sync.log
```

#### Enable/Disable Service

```bash
# Enable (start on boot)
systemctl enable config-manager

# Disable (don't start on boot)
systemctl disable config-manager

# Check if enabled
systemctl is-enabled config-manager
```

#### Manual Intervention (Bypass Service)

```bash
# Disable service temporarily
systemctl stop config-manager
systemctl disable config-manager

# Make manual changes
vim /etc/nginx/nginx.conf

# Re-enable service
systemctl enable config-manager
systemctl start config-manager
```

---

## Exit Codes

Config-manager components use consistent exit codes:

| Code | Meaning                  | Triggered By      | Action                               |
| ---- | ------------------------ | ----------------- | ------------------------------------ |
| `0`  | Success                  | All components    | Continue                             |
| `1`  | General/unexpected error | Any component     | Abort, check logs                    |
| `2`  | Lock acquisition failed  | config-sync       | Another instance running, wait       |
| `2`  | Snapshots disabled       | snapshot-manager  | Expected if `SNAPSHOT_ENABLED=no`    |
| `3`  | Configuration error      | config-sync       | Fix `/etc/config-manager/config.env` |
| `3`  | Backend operation failed | snapshot-manager  | Check filesystem, permissions        |
| `4`  | Git operation failed     | config-sync       | Check network, repo URL, credentials |
| `4`  | Invalid arguments        | CLI tools         | Check command syntax                 |
| `5`  | Conflicts detected       | conflict-detector | Resolve conflicts or rollback        |

**Debugging with exit codes**:

```bash
# Run config-sync and capture exit code
/usr/local/bin/config-sync.sh
EXIT_CODE=$?

case $EXIT_CODE in
    0) echo "Success" ;;
    1) echo "General error — check logs" ;;
    2) echo "Lock or snapshot issue" ;;
    3) echo "Configuration error" ;;
    4) echo "Git error" ;;
    5) echo "Conflicts detected" ;;
esac
```

---

## File System Layout

Complete directory structure for config-manager:

```
/usr/local/bin/
├── config-sync.sh                     # Main orchestrator
└── config-rollback                    # CLI tool

/usr/local/lib/config-manager/
├── config-manager-helpers.sh          # Shared utilities
├── execute-scripts.sh                 # Script execution engine
├── process-files.sh                   # File deployment engine
├── snapshot-manager.sh                # Snapshot system
├── conflict-detector.sh               # Conflict detection
└── package-handlers/
    ├── handler-common.sh              # Package orchestration
    ├── handler-logging.sh             # Logging utilities
    ├── handler-apt.sh                 # APT handler
    ├── handler-apk.sh                 # APK handler
    ├── handler-dnf.sh                 # DNF/YUM handler
    ├── handler-npm.sh                 # NPM handler
    ├── handler-pip.sh                 # PIP handler
    └── handler-custom.sh              # Custom installer handler

/etc/config-manager/
└── config.env                         # Configuration file

/var/log/config-manager/
├── sync.log                           # Sync operation log
└── rollback.log                       # Rollback operation log

/var/lib/config-manager/
├── snapshot-state                     # Last snapshot name
├── CONFLICT                           # Conflict marker (if conflicts exist)
├── backups/                           # File-level backups (fallback backend)
│   └── config-manager-YYYYMMDD-HHMMSS/
│       ├── MANIFEST
│       ├── METADATA
│       ├── STATUS
│       ├── files/                     # Backed-up managed files
│       └── state/                     # State directory backup
└── state/
    ├── checksums.prev                 # Last sync checksums
    ├── checksums.current              # Current run checksums
    ├── conflicts.log                  # Conflict details
    └── managed-files.list             # Managed file registry

/opt/config-manager/
└── repo/                              # Cloned git repository
    └── infra/lxc/templates/*/container-configs/
        ├── scripts/                   # Executed scripts
        ├── files/                     # Managed files
        └── packages/                  # Package lists

/etc/systemd/system/
└── config-manager.service             # Systemd service

/run/config-manager/
└── config-manager.lock                # Lock file (active instance)
```

---

## Advanced Topics

### Multi-environment Setup

Use git branches to manage different environments:

```bash
# Production container
CONFIG_BRANCH="main"

# Staging container
CONFIG_BRANCH="staging"

# Development container
CONFIG_BRANCH="develop"
```

**Workflow**:

1. Make changes on `develop` branch
2. Test in development container
3. Merge to `staging`, test in staging container
4. Merge to `main`, deploy to production

### Custom Repository Structure

If you want a non-standard repo layout:

```
your-repo/
└── my-custom-path/
    ├── scripts/
    ├── files/
    └── packages/
```

**Set in `/etc/config-manager/config.env`**:

```bash
CONFIG_PATH="my-custom-path"
```

### Security Considerations

#### Git Repository Trust

- **HTTPS repos**: Public repos are safe (read-only)
- **SSH repos**: Requires SSH key (keep private key secure)
- **Self-hosted**: Ensure TLS certificates are valid

#### File Permissions

- **Managed files**: Inherit ownership from parent directory
- **Scripts**: Executed as root (be cautious)
- **Sensitive files**: Use `0600` permissions in git (preserved on deployment)

#### Snapshot Security

- **ZFS/LVM/BTRFS**: Snapshots accessible by root only
- **File-level backups**: Stored in `/var/lib/config-manager/backups/` (root-only)
- **Retention**: Old snapshots deleted automatically (no sensitive data lingering)

### Performance Optimization

#### Large Repositories

If your repo is large (>100 MB):

```bash
# Use shallow clone (reduces initial clone time)
git clone --depth 1 "$CONFIG_REPO_URL" "$REPO_DIR"
```

**Modify `config-sync.sh`** to add `--depth 1` to clone command.

#### Parallel Script Execution

Scripts run **sequentially** by default (safe, predictable). For advanced users:

```bash
# Run independent scripts in parallel (requires custom wrapper)
parallel bash ::: 10-*.sh 20-*.sh 30-*.sh
```

**Caution**: Ensure scripts don't have dependencies or race conditions.

#### Checksum Caching

Checksums are computed on every sync. For many files, this can be slow. Consider:

- Fewer managed files (use `default` policy sparingly)
- Faster hash algorithm (MD5 instead of SHA-256, less secure)

### Debugging

Enable verbose logging:

```bash
# In config-sync.sh, add:
set -x  # Print every command

# Or run with bash -x
bash -x /usr/local/bin/config-sync.sh
```

**Log locations**:

- `/var/log/config-manager/sync.log` — All sync operations
- `journalctl -u config-manager` — Systemd journal
- `/var/lib/config-manager/state/conflicts.log` — Conflict details

---

## Next Steps

- **[Setup Guide](SETUP.md)** — Installation and quick start
- **[Migration Guide](MIGRATION.md)** — Moving from other setups
- **[Troubleshooting](TROUBLESHOOTING.md)** — Common issues and solutions

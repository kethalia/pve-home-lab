# LXC Configuration Manager — Configuration Reference

## Repository Structure

```
container-configs/
├── scripts/           Boot scripts (run in alphabetical order)
│   ├── 00-pre-checks.sh
│   ├── 01-system-setup.sh
│   └── ...
├── files/             Managed configuration files
│   ├── .zshrc
│   ├── .zshrc.path
│   ├── .zshrc.policy
│   └── ...
└── packages/          Package lists by manager
    ├── system.apt
    ├── development.apt
    ├── system.apk
    └── custom.sh
```

## Boot Scripts (`scripts/`)

### Naming Convention

Scripts execute in `LC_ALL=C` sort order. Use numeric prefixes:

```
00-*.sh   Pre-flight checks
01-*.sh   System configuration
02-*.sh   Core tools (Docker, etc.)
03-*.sh   Language runtimes
04-*.sh   Development tools
05-*.sh   Shell configuration
50-*.sh   Services (VS Code, etc.)
99-*.sh   Post-setup validation
```

### Environment Variables

Available to all scripts:

| Variable | Description | Example |
|----------|-------------|---------|
| `CONFIG_MANAGER_VERSION` | Config manager version | `1.0.0` |
| `CONFIG_MANAGER_ROOT` | Path to container-configs | `/opt/config-manager/repo/infra/lxc/container-configs` |
| `CONFIG_MANAGER_LOG` | Path to sync log | `/var/log/config-manager/sync.log` |
| `CONFIG_MANAGER_FIRST_RUN` | First time running | `true` or `false` |
| `CONTAINER_OS` | Detected OS | `ubuntu`, `debian`, `alpine` |
| `CONTAINER_OS_VERSION` | OS version | `24.04` |
| `CONTAINER_USER` | Container user | `coder` |

### Helper Functions

```bash
is_installed <command>      # Returns 0 if command exists
ensure_installed <package>  # Install package if missing
log_info <message>          # Log at INFO level
log_warn <message>          # Log at WARN level
log_error <message>         # Log at ERROR level
log_ok <message>            # Log at OK level
```

### Writing Idempotent Scripts

Scripts should be safe to re-run:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Good: check before installing
if is_installed docker; then
  log_info "Docker already installed."
  exit 0
fi

# Good: check before creating
if [ ! -d "/some/dir" ]; then
  mkdir -p /some/dir
fi
```

### Error Handling

- A failed script **stops the entire chain**.
- The snapshot (if available) is preserved for rollback.
- Check logs at `/var/log/config-manager/sync.log`.

## File Management (`files/`)

### File Triplet Convention

For each managed file, create three files:

| File | Purpose | Content |
|------|---------|---------|
| `filename` | The actual file | File contents |
| `filename.path` | Target directory (single line) | `/home/coder/.config` |
| `filename.policy` | Deployment policy (single line) | `replace`, `default`, or `backup` |

### Policies

| Policy | Target Exists | Action |
|--------|--------------|--------|
| **`default`** | Yes | Skip (preserve user changes) |
| **`default`** | No | Copy file to target |
| **`replace`** | Yes | Overwrite (keep in sync with git) |
| **`replace`** | No | Copy file to target |
| **`backup`** | Yes | Backup existing as `.backup-YYYYMMDD-HHMMSS`, then copy |
| **`backup`** | No | Copy file to target |

### Edge Cases

- Missing `.path` file: logs error, skips the file
- Missing `.policy` file: defaults to `default` policy
- Files are compared by SHA-256 checksum; identical files are never rewritten

### Ownership

Files deployed under the container user's home directory are automatically `chown`ed to that user.

## Package Management (`packages/`)

### File Naming

| Extension | Package Manager | Distribution |
|-----------|----------------|--------------|
| `.apt` | apt-get | Ubuntu, Debian |
| `.apk` | apk | Alpine |
| `.dnf` | dnf/yum | Fedora, RHEL, CentOS |
| `.npm` | npm | Cross-distribution |
| `.pip` | pip/pip3 | Cross-distribution |
| `.custom` or `custom.sh` | Custom handler | Cross-distribution |

### File Format

```bash
# Comments start with #
# One package per line
curl
git
build-essential   # inline comments are stripped

# Version pinning (apt)
nodejs=24.*
```

### Custom Installations (`custom.sh`)

Format: `name|check_command|install_command`

```bash
# name          | check if installed          | install command
foundry|command -v forge|curl -L https://foundry.paradigm.xyz | bash && foundryup
gh-cli|command -v gh|apt-get install -y gh
```

- `check_command`: runs before install; if exit 0, skip
- `install_command`: runs with 5-minute timeout
- Failed custom installs don't block remaining installs

## Snapshot System

### Backends

Auto-detected in order: ZFS > LVM > BTRFS > file-level fallback.

### Configuration

```bash
# /etc/config-manager/config.env
SNAPSHOT_ENABLED=auto          # auto|yes|no
SNAPSHOT_RETENTION_DAYS=7      # cleanup older snapshots
SNAPSHOT_BACKEND=auto          # auto|zfs|lvm|btrfs|none
```

### Commands

```bash
config-rollback list              # List available snapshots
config-rollback status            # Show conflict status
config-rollback restore <name>    # Restore to snapshot
config-rollback resolve           # Clear conflict after manual fix
```

## Conflict Resolution

### When Conflicts Occur

A conflict is detected when:

1. A managed file (with `replace` or `backup` policy) was modified locally
2. AND the same file was changed in the git repository
3. AND the local change differs from what was deployed in the last sync

### What Happens

1. Sync **aborts** immediately
2. Snapshot is **preserved**
3. Conflict details are logged
4. A `CONFLICT` marker file is created at `/var/lib/config-manager/CONFLICT`

### Resolution Steps

```bash
# 1. Check what conflicted
config-rollback status

# 2a. Rollback to pre-sync state
config-rollback restore <snapshot-name>

# 2b. OR manually fix the conflicting files, then:
config-rollback resolve

# 3. Re-run sync
/usr/local/bin/config-sync.sh
```

## Logging

| Log | Location |
|-----|----------|
| Sync log | `/var/log/config-manager/sync.log` |
| Systemd journal | `journalctl -u config-manager` |
| Conflict log | `/var/lib/config-manager/conflicts.log` |
| Last sync time | `/var/lib/config-manager/last-sync` |

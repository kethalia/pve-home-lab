# Troubleshooting Guide

This guide covers common issues with LXC containers and config-manager, along with diagnostic steps and solutions.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Common Issues](#common-issues)
  1. [Service Not Starting / Failing on Boot](#1-service-not-starting--failing-on-boot)
  2. [Git Sync Failures](#2-git-sync-failures)
  3. [Snapshot/Rollback Problems](#3-snapshotrollback-problems)
  4. [Package Installation Failures](#4-package-installation-failures)
  5. [File Permission Issues](#5-file-permission-issues)
  6. [Conflict Detection Issues](#6-conflict-detection-issues)
  7. [Script Execution Issues](#7-script-execution-issues)
  8. [Container Creation Issues](#8-container-creation-issues)
  9. [First Boot Issues](#9-first-boot-issues)
  10. [Performance Issues](#10-performance-issues)
- [Debugging Guide](#debugging-guide)
- [Getting Help](#getting-help)

---

## Quick Diagnostics

Before diving into specific issues, run these commands to gather diagnostic information:

### Check Service Status

```bash
systemctl status config-manager

# Expected output (successful sync):
# ● config-manager.service - LXC Configuration Manager
#    Active: inactive (dead) since Mon 2026-02-03 14:30:30
#   Process: 1234 ExecStart=/usr/local/bin/config-sync.sh (code=exited, status=0/SUCCESS)
```

**Status meanings**:

| Status                        | Meaning             | Action                    |
| ----------------------------- | ------------------- | ------------------------- |
| `active (running)`            | Currently syncing   | Wait for completion       |
| `inactive (dead)` + `SUCCESS` | Last sync succeeded | All good                  |
| `failed`                      | Last sync failed    | Check logs below          |
| `activating (start)`          | Stuck starting      | Check for lock or timeout |

### View Recent Logs

```bash
# Last 50 lines from journald
journalctl -u config-manager -n 50

# Follow logs in real-time
journalctl -u config-manager -f

# View sync log file
tail -50 /var/log/config-manager/sync.log

# Search for errors
grep ERROR /var/log/config-manager/sync.log
```

### Check for Conflicts

```bash
config-rollback status

# Output if no conflicts:
# ✓ No conflicts detected
# Last sync: 2026-02-03 14:30:22

# Output if conflicts:
# ✗ Conflict detected: 2 file(s) have conflicting changes
# Conflicts log: /var/lib/config-manager/state/conflicts.log
```

### List Snapshots

```bash
config-rollback list

# Output:
# Available snapshots:
#   config-manager-20260203-143022:good  (2026-02-03 14:30:22) [good]
#   config-manager-20260202-090000:good  (2026-02-02 09:00:00) [good]
```

### Check Configuration

```bash
# View configuration file
cat /etc/config-manager/config.env

# Verify repository URL
grep CONFIG_REPO_URL /etc/config-manager/config.env

# Test git access
cd /opt/config-manager/repo && git fetch --dry-run
```

### Check Disk Space

```bash
# Overall disk usage
df -h /

# Config-manager directories
du -sh /opt/config-manager/repo
du -sh /var/lib/config-manager/backups/
du -sh /var/log/config-manager/
```

---

## Common Issues

## 1. Service Not Starting / Failing on Boot

### Symptom

Config-manager service shows `failed` status:

```bash
systemctl status config-manager
# ● config-manager.service - LXC Configuration Manager
#    Active: failed (Result: exit-code) since Mon 2026-02-03 14:30:30
#   Process: 1234 ExecStart=/usr/local/bin/config-sync.sh (code=exited, status=3/NOTIMPLEMENTED)
```

### Causes

1. **Configuration file missing or invalid** (exit code 3)
2. **Git repository unreachable** (exit code 4)
3. **Snapshot backend issues** (exit code 3)
4. **Lock file stale** (exit code 2)
5. **Network not ready**

### Diagnosis

```bash
# 1. Check config file exists
ls -la /etc/config-manager/config.env

# 2. Verify config syntax (should have no errors)
bash -n /etc/config-manager/config.env

# 3. Test git repository access
cd /opt/config-manager/repo && git fetch

# 4. Check lock file
ls -la /run/config-manager/config-manager.lock
# If exists, check PID
cat /run/config-manager/config-manager.lock
ps -p <PID>  # Should return "no such process" if stale

# 5. Check network
ping -c 3 github.com
```

### Solutions

#### Solution 1A: Fix Missing/Invalid Configuration

```bash
# If config file is missing, recreate it
sudo tee /etc/config-manager/config.env <<EOF
CONFIG_REPO_URL="https://github.com/kethalia/infrahaus.git"
CONFIG_BRANCH="main"
CONFIG_PATH="infra/lxc/templates/web3-dev/container-configs"
SNAPSHOT_ENABLED="auto"
SNAPSHOT_RETENTION_DAYS="7"
EOF

# Restart service
sudo systemctl restart config-manager
```

#### Solution 1B: Fix Git Repository Access

```bash
# Check current repo URL
grep CONFIG_REPO_URL /etc/config-manager/config.env

# Test access
git ls-remote <repo-url>

# If private repo, set up SSH key
ssh-keygen -t ed25519 -C "config-manager@lxc"
cat ~/.ssh/id_ed25519.pub
# Add to GitHub/GitLab as deploy key

# Update config to use SSH URL
sudo vim /etc/config-manager/config.env
# Change to: CONFIG_REPO_URL="git@github.com:user/repo.git"

# Re-clone repository
sudo rm -rf /opt/config-manager/repo
sudo systemctl restart config-manager
```

#### Solution 1C: Remove Stale Lock File

```bash
# Check if process is actually running
PID=$(cat /run/config-manager/config-manager.lock 2>/dev/null || echo "")
if [[ -n "$PID" ]]; then
    ps -p "$PID" || echo "Stale lock"
fi

# If stale, remove lock
sudo rm /run/config-manager/config-manager.lock

# Restart service
sudo systemctl restart config-manager
```

#### Solution 1D: Wait for Network

If service starts before network is ready:

```bash
# Edit service to add dependency
sudo systemctl edit config-manager

# Add these lines:
[Unit]
After=network-online.target
Wants=network-online.target

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart config-manager
```

### Example Resolution

**Real log output**:

```
[ERROR] Configuration file not found: /etc/config-manager/config.env
[ERROR] Configuration sync failed with exit code 3
```

**Fix applied**:

```bash
# Recreate config file
sudo tee /etc/config-manager/config.env <<EOF
CONFIG_REPO_URL="https://github.com/kethalia/infrahaus.git"
CONFIG_BRANCH="main"
CONFIG_PATH="infra/lxc/templates/web3-dev/container-configs"
SNAPSHOT_ENABLED="auto"
EOF

# Restart
sudo systemctl restart config-manager

# Verify
systemctl status config-manager
# ✓ Active: inactive (dead) ... (code=exited, status=0/SUCCESS)
```

---

## 2. Git Sync Failures

### 2.1 Repository Not Found / Authentication Failed

#### Symptom

```bash
journalctl -u config-manager -n 20
# [ERROR] Git operation failed: fatal: repository not found
# [ERROR] Configuration sync failed with exit code 4
```

#### Causes

- Repository URL is incorrect
- Repository is private and no authentication configured
- SSH key not added to git server
- Network firewall blocking git protocol

#### Diagnosis

```bash
# 1. Check configured URL
grep CONFIG_REPO_URL /etc/config-manager/config.env

# 2. Test URL manually
git ls-remote <CONFIG_REPO_URL>

# 3. If SSH URL, test SSH access
ssh -T git@github.com
# Expected: "Hi <user>! You've successfully authenticated..."

# 4. Check SSH key exists
ls -la ~/.ssh/id_*
```

#### Solutions

**Solution 2.1A: Fix Repository URL**

```bash
# Edit config
sudo vim /etc/config-manager/config.env

# Correct URL format:
# HTTPS: https://github.com/user/repo.git
# SSH:   git@github.com:user/repo.git

# Remove old repo
sudo rm -rf /opt/config-manager/repo

# Retry sync
sudo systemctl restart config-manager
```

**Solution 2.1B: Set Up SSH Authentication**

```bash
# Generate SSH key (if not exists)
ssh-keygen -t ed25519 -C "config-manager@$(hostname)"

# Display public key
cat ~/.ssh/id_ed25519.pub

# Add to GitHub:
# 1. Go to repo Settings → Deploy keys → Add deploy key
# 2. Paste public key, give it a name, save

# Test access
ssh -T git@github.com

# Update config to use SSH URL
sudo vim /etc/config-manager/config.env
# CONFIG_REPO_URL="git@github.com:user/repo.git"

# Retry sync
sudo systemctl restart config-manager
```

**Solution 2.1C: Use Personal Access Token (HTTPS)**

```bash
# Create PAT on GitHub (Settings → Developer settings → PAT)

# Update config with token in URL
sudo vim /etc/config-manager/config.env
# CONFIG_REPO_URL="https://<USERNAME>:<TOKEN>@github.com/user/repo.git"

# Security note: Token is stored in plaintext!
# Better: Use SSH keys (Solution 2.1B)

# Retry sync
sudo systemctl restart config-manager
```

---

### 2.2 Merge Conflicts in Config Repository

#### Symptom

```bash
# Git pull fails with merge conflict
[ERROR] Git pull failed: error: Your local changes to the following files would be overwritten by merge
```

#### Cause

Local changes in `/opt/config-manager/repo` conflict with remote updates.

#### Diagnosis

```bash
# Check for local changes
cd /opt/config-manager/repo
git status
# Output: "Changes not staged for commit" or "Untracked files"

# View diff
git diff
```

#### Solutions

**Solution 2.2A: Discard Local Changes**

```bash
cd /opt/config-manager/repo

# Discard all local changes
git reset --hard origin/$(git branch --show-current)
git clean -fd

# Retry sync
sudo systemctl restart config-manager
```

**Solution 2.2B: Commit Local Changes**

```bash
cd /opt/config-manager/repo

# Stage changes
git add .

# Commit
git commit -m "Local changes from $(hostname) on $(date)"

# Push (if you have write access)
git push

# Or create a branch
git checkout -b local-changes-$(hostname)
git push -u origin local-changes-$(hostname)

# Then reset main to upstream
git checkout main
git reset --hard origin/main

# Retry sync
sudo systemctl restart config-manager
```

---

### 2.3 Network Issues

#### Symptom

```bash
# Git clone/pull times out
[ERROR] Git operation failed: fatal: unable to access 'https://github.com/...': Could not resolve host
```

#### Causes

- DNS not working
- Network not connected
- Firewall blocking port 443 (HTTPS) or 22 (SSH)
- GitHub down (rare)

#### Diagnosis

```bash
# 1. Test DNS
nslookup github.com
dig github.com

# 2. Test network connectivity
ping -c 3 github.com

# 3. Test HTTPS port
curl -I https://github.com

# 4. Test SSH port (if using SSH)
nc -zv github.com 22

# 5. Check GitHub status
curl -s https://www.githubstatus.com/api/v2/status.json | jq
```

#### Solutions

**Solution 2.3A: Fix DNS**

```bash
# Check DNS configuration
cat /etc/resolv.conf

# If empty or pointing to unreachable server, fix it
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
echo "nameserver 1.1.1.1" | sudo tee -a /etc/resolv.conf

# Test DNS
nslookup github.com

# Retry sync
sudo systemctl restart config-manager
```

**Solution 2.3B: Wait for Network**

```bash
# If running too early in boot, add network dependency
sudo systemctl edit config-manager

# Add:
[Unit]
After=network-online.target
Wants=network-online.target

# Reload
sudo systemctl daemon-reload
sudo reboot
```

**Solution 2.3C: Use Alternative Git Host**

```bash
# If GitHub is down, use GitLab mirror or local git server
sudo vim /etc/config-manager/config.env
# CONFIG_REPO_URL="https://gitlab.com/user/repo.git"

# Or set up local mirror
git clone --mirror https://github.com/user/repo.git /mnt/git-mirror/repo.git
# CONFIG_REPO_URL="file:///mnt/git-mirror/repo.git"

# Retry sync
sudo systemctl restart config-manager
```

---

## 3. Snapshot/Rollback Problems

### 3.1 Snapshot Creation Fails

#### Symptom

```bash
[WARNING] Snapshot creation failed: command not found: zfs
[WARNING] Falling back to file-level snapshots
```

Or:

```bash
[ERROR] Snapshot creation failed: cannot create snapshot: out of space
```

#### Causes

- Snapshot backend not detected correctly
- Backend utilities not installed (`zfs`, `lvm2`, `btrfs-progs`)
- Disk space exhausted
- Permissions issue

#### Diagnosis

```bash
# 1. Check snapshot backend
cat /etc/config-manager/config.env | grep SNAPSHOT_BACKEND

# 2. Check if utilities are installed
which zfs lvcreate btrfs

# 3. Check disk space
df -h /

# 4. Check backend status
sudo /usr/local/lib/config-manager/snapshot-manager.sh status
```

#### Solutions

**Solution 3.1A: Install Backend Utilities**

```bash
# For ZFS (if root is on ZFS)
sudo apt-get install zfsutils-linux

# For LVM
sudo apt-get install lvm2

# For BTRFS
sudo apt-get install btrfs-progs

# Retry
sudo systemctl restart config-manager
```

**Solution 3.1B: Force Specific Backend**

```bash
# Edit config
sudo vim /etc/config-manager/config.env

# Set specific backend
SNAPSHOT_BACKEND="zfs"  # or lvm, btrfs, none

# Or disable and use file-level
SNAPSHOT_BACKEND="none"

# Retry
sudo systemctl restart config-manager
```

**Solution 3.1C: Free Disk Space**

```bash
# Check space
df -h /

# Clean old snapshots
config-rollback list
# Delete old snapshots manually if cleanup isn't working

# For ZFS
sudo zfs destroy tank/lxc/100@config-manager-20260101-000000

# For LVM
sudo lvremove /dev/vg0/config-manager-20260101-000000

# For file-level
sudo rm -rf /var/lib/config-manager/backups/config-manager-20260101-000000

# Retry
sudo systemctl restart config-manager
```

---

### 3.2 Backend Detection Issues

#### Symptom

```bash
[WARNING] Unable to detect snapshot backend, falling back to file-level
```

But you know your root is on ZFS/LVM/BTRFS.

#### Cause

- `findmnt` utility not installed (required for detection)
- Root filesystem not properly detected

#### Diagnosis

```bash
# 1. Check if findmnt is available
which findmnt

# 2. Check filesystem type
findmnt -n -o FSTYPE /

# 3. Manually test backend detection
# ZFS
findmnt -n -o FSTYPE / | grep -q zfs && echo "ZFS detected"

# LVM
lvs --noheadings -o lv_path "$(findmnt -n -o SOURCE /)" && echo "LVM detected"

# BTRFS
findmnt -n -o FSTYPE / | grep -q btrfs && echo "BTRFS detected"
```

#### Solutions

**Solution 3.2A: Install findmnt**

```bash
# Install util-linux (provides findmnt)
sudo apt-get install util-linux

# Retry
sudo systemctl restart config-manager
```

**Solution 3.2B: Force Backend in Config**

```bash
# Edit config
sudo vim /etc/config-manager/config.env

# Explicitly set backend
SNAPSHOT_BACKEND="zfs"  # or lvm, btrfs

# Retry
sudo systemctl restart config-manager
```

---

### 3.3 Rollback Doesn't Restore Files

#### Symptom

After running `config-rollback restore <snapshot>`, files are not restored.

#### Causes

- File-level backend doesn't auto-restore (manual restore required)
- ZFS/LVM rollback requires reboot
- Snapshot is empty or corrupted

#### Diagnosis

```bash
# 1. Check snapshot details
config-rollback show <snapshot-name>

# 2. For file-level, check backup directory
ls -la /var/lib/config-manager/backups/<snapshot-name>/files/

# 3. Check snapshot backend
cat /etc/config-manager/config.env | grep SNAPSHOT_BACKEND
```

#### Solutions

**Solution 3.3A: Manual File-level Restore**

```bash
# File-level snapshots require manual file copy
SNAPSHOT="config-manager-20260203-143022"

# Restore files
sudo rsync -av /var/lib/config-manager/backups/$SNAPSHOT/files/ /

# Restore state
sudo rsync -av /var/lib/config-manager/backups/$SNAPSHOT/state/ /var/lib/config-manager/state/

# Verify
cat ~/.bashrc  # Should match backup
```

**Solution 3.3B: ZFS/LVM Requires Reboot**

```bash
# For ZFS
sudo zfs rollback tank/lxc/100@config-manager-20260203-143022

# For LVM (merge on next boot)
sudo lvconvert --merge /dev/vg0/config-manager-20260203-143022
sudo reboot

# After reboot, verify
config-rollback status
```

---

## 4. Package Installation Failures

### 4.1 Package Not Found

#### Symptom

```bash
[ERROR] Package installation failed: E: Unable to locate package nodejs-24
```

#### Causes

- Package name is incorrect
- Package repository not configured
- Package index not updated

#### Diagnosis

```bash
# 1. Search for correct package name
apt-cache search nodejs

# 2. Check if repositories are configured
cat /etc/apt/sources.list
ls /etc/apt/sources.list.d/

# 3. Try manual installation
sudo apt-get update
sudo apt-get install nodejs
```

#### Solutions

**Solution 4.1A: Fix Package Name**

```bash
# Search for correct name
apt-cache search <tool>

# Update package list in git
cd /opt/config-manager/repo
vim infra/lxc/templates/*/container-configs/packages/base.apt
# Change: nodejs-24 → nodejs

git commit -am "Fix package name"
git push

# Retry
sudo systemctl restart config-manager
```

**Solution 4.1B: Add Package Repository**

```bash
# Example: Add NodeSource repository for Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash

# Or add to script
cat > /opt/config-manager/repo/.../scripts/11-add-nodejs-repo.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f /etc/apt/sources.list.d/nodesource.list ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash
    log_info "NodeSource repository added"
fi
EOF

git add .
git commit -m "Add NodeSource repository"
git push

# Retry
sudo systemctl restart config-manager
```

---

### 4.2 Version Conflicts

#### Symptom

```bash
[ERROR] The following packages have unmet dependencies:
nodejs : Depends: libnode72 (= 20.0.0) but 18.0.0 is to be installed
```

#### Cause

Requested version conflicts with installed packages.

#### Diagnosis

```bash
# Check installed version
dpkg -l | grep nodejs

# Check available versions
apt-cache madison nodejs

# Check dependencies
apt-cache depends nodejs=20.0.0
```

#### Solutions

**Solution 4.2A: Remove Conflicting Package**

```bash
# Remove old version
sudo apt-get remove nodejs

# Retry sync
sudo systemctl restart config-manager
```

**Solution 4.2B: Pin Specific Compatible Version**

```bash
# Update package list
vim container-configs/packages/base.apt
# Change: nodejs → nodejs=20.0.0-1ubuntu1

git commit -am "Pin nodejs version"
git push

# Retry
sudo systemctl restart config-manager
```

---

### 4.3 Custom Installer Timeout

#### Symptom

```bash
[ERROR] Custom installer 'foundry' timed out after 300 seconds
```

#### Cause

Installation is taking longer than timeout (default: 300 seconds).

#### Diagnosis

```bash
# Check custom installer definition
cat container-configs/packages/*.custom | grep foundry
```

#### Solutions

**Solution 4.3A: Increase Timeout**

```bash
# Edit custom installer
vim container-configs/packages/cli.custom

# Change:
# foundry|command -v forge|<install-command>|600
#                                           ^^^^ 10 minutes instead of 5

git commit -am "Increase foundry install timeout"
git push

# Retry
sudo systemctl restart config-manager
```

**Solution 4.3B: Test Installer Manually**

```bash
# Run install command manually to see what's wrong
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc
foundryup

# If it works, check timeout was the issue
# If it fails, fix the install command
```

---

### 4.4 Package Manager Locked

#### Symptom

```bash
[ERROR] Could not get lock /var/lib/dpkg/lock-frontend
```

#### Cause

Another package manager process is running (e.g., unattended-upgrades).

#### Diagnosis

```bash
# Check if apt/dpkg is running
ps aux | grep -E 'apt|dpkg' | grep -v grep

# Check lock files
ls -la /var/lib/dpkg/lock*
ls -la /var/lib/apt/lists/lock
```

#### Solutions

**Solution 4.4A: Wait for Process to Finish**

```bash
# Wait for unattended-upgrades or other apt processes to complete
sudo systemctl status unattended-upgrades

# Wait a few minutes, then retry
sleep 300
sudo systemctl restart config-manager
```

**Solution 4.4B: Kill Stale Lock**

```bash
# Only if no apt process is actually running
ps aux | grep apt | grep -v grep  # Should be empty

# Remove locks
sudo rm /var/lib/dpkg/lock-frontend
sudo rm /var/lib/dpkg/lock
sudo rm /var/lib/apt/lists/lock
sudo rm /var/cache/apt/archives/lock

# Reconfigure dpkg
sudo dpkg --configure -a

# Retry
sudo systemctl restart config-manager
```

---

## 5. File Permission Issues

### 5.1 Target Not Writable

#### Symptom

```bash
[ERROR] Failed to deploy file: /etc/nginx/nginx.conf: Permission denied
```

#### Cause

- Config-manager running as non-root
- Target directory has restrictive permissions
- SELinux/AppArmor blocking write

#### Diagnosis

```bash
# Check target directory permissions
ls -lad /etc/nginx

# Check file ownership
ls -la /etc/nginx/nginx.conf

# Check if running as root
ps aux | grep config-sync | grep root
```

#### Solutions

**Solution 5.1A: Ensure Service Runs as Root**

```bash
# Check service user
grep User /etc/systemd/system/config-manager.service

# Should NOT have User= line (defaults to root)
# If it has User=, remove it
sudo systemctl edit config-manager
# Remove any User= lines

sudo systemctl daemon-reload
sudo systemctl restart config-manager
```

**Solution 5.1B: Fix Target Permissions**

```bash
# Make directory writable
sudo chmod 755 /etc/nginx

# Or deploy to user-writable location
# Change .path file to point to ~/config/ instead of /etc/
```

---

### 5.2 Ownership Mismatch

#### Symptom

Files are deployed but owned by root, user can't edit them:

```bash
ls -la ~/.bashrc
# -rw-r--r-- 1 root root 220 Feb  3 14:30 .bashrc
```

#### Cause

Ownership mismatches usually indicate a configuration or environment issue rather than a bug in `process-files.sh`.

Common causes include:

- The target directory is owned by `root` (or another user), so the deployed file is correctly `chown`ed to that owner
- The `.path` unit or target path is not what you expect (e.g., pointing to `/root` instead of your home directory)
- Manual edits or previous deployments left files with unexpected ownership

#### Diagnosis

```bash
# 1. Check parent directory ownership
ls -lad ~
# drwxr-xr-x 10 coder coder 4096 Feb  3 14:30 /home/coder

# 2. Check deployed file ownership
ls -la ~/.bashrc
# If shows root:root but parent is coder:coder, investigate further

# 3. Verify .path file points to correct location
cat /opt/config-manager/repo/<CONFIG_PATH>/files/.bashrc.path
# Should show /home/coder, not /root

# 4. Check if target directory has correct owner
stat -c '%U:%G' /home/coder
# Should show coder:coder
```

#### Solutions

**Solution 5.2A: Manual Fix**

```bash
# Fix ownership for deployed files
sudo chown -R coder:coder /home/coder

# Verify
ls -la ~/.bashrc
# -rw-r--r-- 1 coder coder 220 Feb  3 14:30 .bashrc
```

**Solution 5.2B: Add Post-Processing Script**

If ownership issues persist across multiple files, add a script to fix ownership after file deployment:

```bash
# Add post-processing script
cat > container-configs/scripts/98-fix-ownership.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Fix ownership for user home directory after file deployment
if [[ -n "${CONTAINER_USER:-}" ]]; then
    chown -R "$CONTAINER_USER:$CONTAINER_USER" "/home/$CONTAINER_USER" || true
    log_info "Fixed ownership for /home/$CONTAINER_USER"
fi
EOF

git add .
git commit -m "Add ownership fix script"
git push

sudo systemctl restart config-manager
```

**Note**: This workaround is only needed if the `.path` file or target directory configuration is causing systematic ownership issues.

---

## 6. Conflict Detection Issues

### 6.1 False Positive Conflicts

#### Symptom

```bash
[ERROR] Conflicts detected between local changes and git updates
Conflict: /home/coder/.bashrc
```

But you haven't edited the file manually.

#### Causes

- Newline differences (LF vs CRLF)
- Whitespace differences (tabs vs spaces, trailing whitespace)
- Encoding differences (UTF-8 vs ISO-8859-1)

#### Diagnosis

```bash
# Check actual file differences
cd /opt/config-manager/repo
git diff --no-index <CONFIG_PATH>/files/.bashrc /home/coder/.bashrc
# Or use regular diff:
# diff <CONFIG_PATH>/files/.bashrc /home/coder/.bashrc

# Check checksums
sha256sum <CONFIG_PATH>/files/bashrc
cat /var/lib/config-manager/state/checksums.current | grep bashrc
```

#### Solutions

**Solution 6.1A: Resolve False Positive**

```bash
# Remove conflict marker
config-rollback resolve

# Retry sync
sudo systemctl restart config-manager
```

**Solution 6.1B: Force Update from Git**

```bash
# Remove file so it gets redeployed
sudo rm /home/coder/.bashrc

# Retry sync
sudo systemctl restart config-manager
```

---

### 6.2 Can't Resolve Conflicts

#### Symptom

After manual resolution, conflict marker persists.

#### Cause

`config-rollback resolve` didn't remove marker, or new conflicts detected.

#### Diagnosis

```bash
# Check if marker exists
ls -la /var/lib/config-manager/CONFLICT

# Read marker
cat /var/lib/config-manager/CONFLICT

# Check conflicts log
cat /var/lib/config-manager/state/conflicts.log
```

#### Solutions

**Solution 6.2A: Manually Remove Marker**

```bash
# Remove conflict marker
sudo rm /var/lib/config-manager/CONFLICT

# Clear conflict log
sudo rm /var/lib/config-manager/state/conflicts.log

# Retry sync
sudo systemctl restart config-manager
```

**Solution 6.2B: Rollback and Start Fresh**

```bash
# List snapshots
config-rollback list

# Restore previous good snapshot
config-rollback restore config-manager-20260202-090000

# Retry sync
sudo systemctl restart config-manager
```

---

## 7. Script Execution Issues

### 7.1 Scripts Not Running

#### Symptom

Scripts exist in `container-configs/scripts/` but aren't executing.

#### Causes

- Scripts not executable
- Script syntax errors
- Scripts in wrong directory

#### Diagnosis

```bash
# Check scripts exist
ls -la /opt/config-manager/repo/<CONFIG_PATH>/scripts/

# Check permissions
ls -la /opt/config-manager/repo/<CONFIG_PATH>/scripts/*.sh | grep -v 'x'

# Test script manually
bash -n /opt/config-manager/repo/<CONFIG_PATH>/scripts/02-docker-install.sh
```

#### Solutions

**Solution 7.1A: Make Scripts Executable**

```bash
# In git repo
cd container-configs/scripts
chmod +x *.sh
git add --chmod=+x *.sh
git commit -m "Make scripts executable"
git push

# Retry
sudo systemctl restart config-manager
```

**Solution 7.1B: Fix Script Syntax**

```bash
# Test script
bash -n container-configs/scripts/02-docker-install.sh
# If syntax error, fix it

vim container-configs/scripts/02-docker-install.sh
# Fix syntax error

git commit -am "Fix script syntax error"
git push

sudo systemctl restart config-manager
```

---

### 7.2 Script Fails Silently

#### Symptom

Script exits with error but no helpful log message.

#### Cause

Script doesn't use `log_*` functions or handle errors properly.

#### Diagnosis

```bash
# Run script manually with debugging
cd /opt/config-manager/repo/<CONFIG_PATH>
bash -x scripts/02-docker-install.sh
```

#### Solutions

**Solution 7.2A: Add Logging**

```bash
# Update script to use log functions
vim container-configs/scripts/02-docker-install.sh

# Add at top (if not present):
set -euo pipefail

# Replace echo with log_info:
# echo "Installing Docker" → log_info "Installing Docker"

git commit -am "Improve script logging"
git push

sudo systemctl restart config-manager
```

---

## 8. Container Creation Issues

### 8.1 Template Download Fails

#### Symptom

```bash
bash -c "$(curl -fsSL https://...)"
# curl: (6) Could not resolve host: raw.githubusercontent.com
```

#### Causes

- DNS not working on ProxmoxVE host
- Network not connected
- GitHub down
- Typo in URL

#### Solutions

```bash
# Test DNS
nslookup raw.githubusercontent.com

# Fix DNS if broken
echo "nameserver 8.8.8.8" >> /etc/resolv.conf

# Download manually and run
wget https://raw.githubusercontent.com/.../container.sh
bash container.sh
```

---

### 8.2 Resource Allocation Errors

#### Symptom

```bash
[ERROR] Failed to create container: storage limit exceeded
```

#### Cause

ProxmoxVE storage doesn't have enough space.

#### Solutions

```bash
# Check storage
pvesm status

# Free space or use different storage
var_disk=15 bash container.sh  # Request less disk

# Or specify different storage
pct set <container-id> -rootfs local-zfs:20
```

---

## 9. First Boot Issues

### 9.1 Container Won't Start

#### Symptom

Container status shows "stopped" and won't start.

#### Diagnosis

```bash
# Check container status
pct status <container-id>

# View container logs
pct start <container-id>
journalctl -xe
```

#### Solutions

```bash
# Check container config
pct config <container-id>

# Try starting with systemd enabled
pct set <container-id> -features nesting=1
pct start <container-id>
```

---

## 10. Performance Issues

### 10.1 Slow Boot Times

#### Symptom

Container takes 5+ minutes to boot.

#### Causes

- Many packages to install
- Slow network
- CPU-intensive scripts

#### Solutions

```bash
# Check what's taking time
journalctl -u config-manager -n 200 | grep -E '\[INFO\].*took'

# Optimize package lists (remove unused)
# Cache packages on ProxmoxVE host
# Use local apt-cacher-ng
```

---

## Debugging Guide

### Log File Locations

| Log             | Location                                      | Purpose             |
| --------------- | --------------------------------------------- | ------------------- |
| Sync log        | `/var/log/config-manager/sync.log`            | All sync operations |
| Systemd journal | `journalctl -u config-manager`                | Service output      |
| Rollback log    | `/var/log/config-manager/rollback.log`        | Rollback operations |
| Conflicts log   | `/var/lib/config-manager/state/conflicts.log` | Conflict details    |

### Useful Commands

```bash
# Manual sync with verbose output
sudo bash -x /usr/local/bin/config-sync.sh

# Test git access
cd /opt/config-manager/repo && git fetch -v

# Test script manually
cd /opt/config-manager/repo/<CONFIG_PATH>
sudo bash -x scripts/02-docker-install.sh

# Check lock
ls -la /run/config-manager/config-manager.lock

# Clear lock
sudo rm /run/config-manager/config-manager.lock
```

### Exit Code Reference

| Code | Meaning       |
| ---- | ------------- |
| 0    | Success       |
| 1    | General error |
| 2    | Lock failed   |
| 3    | Config error  |
| 4    | Git error     |
| 5    | Conflicts     |

---

## Getting Help

### Information to Gather

When reporting issues, include:

1. **System info**:

   ```bash
   cat /etc/os-release
   pct config <container-id>
   ```

2. **Config-manager version**:

   ```bash
   grep VERSION /usr/local/bin/config-sync.sh
   ```

3. **Service status**:

   ```bash
   systemctl status config-manager
   ```

4. **Logs**:

   ```bash
   journalctl -u config-manager -n 100
   tail -100 /var/log/config-manager/sync.log
   ```

5. **Configuration**:
   ```bash
   cat /etc/config-manager/config.env
   ```

### Where to Ask

- **GitHub Issues**: https://github.com/kethalia/infrahaus/issues
- **GitHub Discussions**: https://github.com/kethalia/infrahaus/discussions

### Contributing Fixes

If you solve an issue, please contribute:

1. Document your solution
2. Submit a pull request with fix
3. Update this troubleshooting guide

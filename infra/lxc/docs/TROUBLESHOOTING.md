# LXC Configuration Manager — Troubleshooting

## Common Issues

### Service not starting on boot

**Symptoms**: Tools not installed, config-manager not running.

```bash
# Check service status
systemctl status config-manager

# Check if enabled
systemctl is-enabled config-manager

# Enable and start manually
systemctl enable config-manager
/usr/local/bin/config-sync.sh
```

### Git sync fails

**Symptoms**: "Git clone failed" or "Git fetch failed" in logs.

```bash
# Check network
curl -fsSL https://github.com >/dev/null && echo "OK" || echo "No network"

# Check repository URL
cat /etc/config-manager/config.env | grep REPO_URL

# Manual clone test
git clone --depth 1 https://github.com/kethalia/pve-home-lab.git /tmp/test-clone
```

### Conflict detected — sync aborted

**Symptoms**: `CONFLICT` marker file, services not updated.

```bash
# View conflict details
config-rollback status

# Option A: Rollback to before the conflict
config-rollback list
config-rollback restore <snapshot-name>

# Option B: Accept your local changes, clear the conflict
config-rollback resolve

# Re-run sync
/usr/local/bin/config-sync.sh
```

### Docker not working inside container

**Symptoms**: Docker daemon not starting, permission denied.

```bash
# Check if container is privileged
cat /proc/1/status | grep CapEff
# Should show a long hex value (privileged), not 0 (unprivileged)

# Check if nesting is enabled (from Proxmox host)
pct config <CTID> | grep features
# Should include: nesting=1

# Restart Docker
systemctl restart docker
docker run hello-world
```

### Package installation failures

**Symptoms**: Specific packages not installed.

```bash
# Check sync log for errors
grep -i "fail\|error" /var/log/config-manager/sync.log

# Try manual install
apt-get update && apt-get install -y <package-name>

# Check if package exists
apt-cache search <package-name>
```

### Permission issues

**Symptoms**: Files owned by root, user can't access.

```bash
# Fix home directory ownership
chown -R coder:coder /home/coder

# Check sudoers
cat /etc/sudoers.d/nopasswd
# Should contain: coder ALL=(ALL) NOPASSWD:ALL
```

### Snapshots not working

**Symptoms**: "No filesystem snapshot backend available" in logs.

This is **normal** for most LXC containers. The system falls back to file-level
backups automatically. Filesystem snapshots require ZFS, LVM, or BTRFS as the
container's backing storage.

```bash
# Check what backend was detected
grep -i "snapshot" /var/log/config-manager/sync.log
```

## Log Locations

| Log | Path | Command |
|-----|------|---------|
| Sync log | `/var/log/config-manager/sync.log` | `cat /var/log/config-manager/sync.log` |
| Systemd journal | — | `journalctl -u config-manager --no-pager` |
| Conflict details | `/var/lib/config-manager/conflicts.log` | `config-rollback status` |

## Useful Debug Commands

```bash
# Full sync log
cat /var/log/config-manager/sync.log

# Last sync time
cat /var/lib/config-manager/last-sync

# Check for active conflict
[ -f /var/lib/config-manager/CONFLICT ] && echo "CONFLICT" || echo "OK"

# Re-run sync with verbose output
/usr/local/bin/config-sync.sh 2>&1 | tee /tmp/sync-debug.log

# Check config
cat /etc/config-manager/config.env

# List all managed files and their policies
ls -la /opt/config-manager/repo/infra/lxc/container-configs/files/
```

## Getting Help

- [GitHub Issues](https://github.com/kethalia/pve-home-lab/issues)
- [Configuration Reference](CONFIGURATION.md)
- [Setup Guide](SETUP.md)

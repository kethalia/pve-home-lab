# Web3 Dev Container - Credentials & Security Guide

## Overview

The Web3 Development Container template implements a secure credential management system with randomly generated passwords for all web services. This guide provides comprehensive information about credential management, security best practices, and password rotation procedures.

## Credential System Architecture

### Security Design Principles

1. **No Hardcoded Passwords:** All passwords are randomly generated during container initialization
2. **Unique Per Container:** Each container deployment generates unique credentials
3. **Secure Storage:** Credentials stored in root-only accessible file (mode 600)
4. **Transparent Access:** Easy credential retrieval for authorized users
5. **Rotation Ready:** Clear procedures for password changes

### Credential Storage

**File Location:** `/etc/infrahaus/credentials`

**Permissions:**

- Owner: root (UID 0)
- Mode: 600 (read/write for owner only)
- Format: Bash-sourceable key=value pairs

**Contents:**

```bash
# Generated credentials for Web3 Dev Container
CODE_SERVER_PASSWORD=Abc123Xyz789Def4
FILEBROWSER_USERNAME=admin
FILEBROWSER_PASSWORD=Xyz456Abc123Ghi7
OPENCODE_PASSWORD=Def789Jkl012Mno3
```

### Password Generation

**Algorithm:**

- Length: 16 characters
- Character set: `A-Z`, `a-z`, `0-9` (62 possible characters)
- Entropy: ~95 bits (16 × log₂(62))
- Source: `/dev/urandom` via `tr` command

**Generation Function:**

```bash
generate_password() {
    local length="${1:-16}"
    tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$length"
}
```

## Accessing Credentials

### From ProxmoxVE Host

**View credentials file:**

```bash
pct exec <container-id> -- cat /etc/infrahaus/credentials
```

**Example output:**

```bash
# Generated credentials for Web3 Dev Container
CODE_SERVER_PASSWORD=Abc123Xyz789Def4
FILEBROWSER_USERNAME=admin
FILEBROWSER_PASSWORD=Xyz456Abc123Ghi7
OPENCODE_PASSWORD=Def789Jkl012Mno3
```

**View welcome banner (includes credentials):**

```bash
pct exec <container-id> -- journalctl -u config-manager -f --no-pager -o cat
```

### Inside Container

**As root:**

```bash
cat /etc/infrahaus/credentials
```

**As coder user:**

```bash
sudo cat /etc/infrahaus/credentials
```

**View welcome message:**

```bash
cat /etc/motd
```

### First Login Workflow

1. **Deploy container** using the template
2. **Wait for config-manager** to complete (2-5 minutes)
3. **Retrieve credentials** from ProxmoxVE host:
   ```bash
   pct exec <container-id> -- cat /etc/infrahaus/credentials
   ```
4. **Save credentials** in password manager (recommended)
5. **Access web services** using retrieved passwords
6. **Rotate passwords** (optional but recommended)

## Service-Specific Credential Management

### VS Code Server (code-server) - Port 8080

**Current Configuration:**

- Password stored in systemd service environment variable
- Password checked on every connection
- Supports both plaintext and hashed passwords

**View current password:**

```bash
sudo cat /etc/infrahaus/credentials | grep CODE_SERVER_PASSWORD
```

**Change password (Method 1 - Plaintext):**

```bash
# 1. Edit service file
sudo vim /etc/systemd/system/code-server@.service

# 2. Update the PASSWORD line under [Service]:
#    Environment=PASSWORD=your-new-password

# 3. Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart code-server@coder

# 4. Verify service is running
sudo systemctl status code-server@coder
```

**Change password (Method 2 - Hashed, More Secure):**

```bash
# 1. Generate password hash (requires Node.js/npm)
echo -n "your-new-password" | npx argon2-cli -e

# 2. Edit service file
sudo vim /etc/systemd/system/code-server@.service

# 3. Update PASSWORD to the hash and add HASHED_PASSWORD flag:
#    Environment=PASSWORD=your-hash-here
#    Environment=HASHED_PASSWORD=true

# 4. Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart code-server@coder
```

**Update credentials file (optional):**

```bash
sudo vim /etc/infrahaus/credentials
# Update: CODE_SERVER_PASSWORD=your-new-password
```

### FileBrowser - Port 8081

**Current Configuration:**

- Username: `admin` (configurable)
- Password stored in FileBrowser's internal database
- Managed via CLI or web interface

**View current credentials:**

```bash
sudo cat /etc/infrahaus/credentials | grep FILEBROWSER
```

**Change password via CLI:**

```bash
# Update admin user password
sudo filebrowser users update admin --password "new-password"

# Restart service
sudo systemctl restart filebrowser

# Verify
sudo systemctl status filebrowser
```

**Change password via web interface:**

1. Login to FileBrowser: `http://<container-ip>:8081`
2. Navigate to **Settings** → **User Management**
3. Click on `admin` user
4. Enter new password
5. Save changes

**Update credentials file (optional):**

```bash
sudo vim /etc/infrahaus/credentials
# Update: FILEBROWSER_PASSWORD=new-password
```

### OpenCode - Port 8082

**Current Configuration:**

- Password passed as command-line argument to opencode binary
- Stored in systemd service ExecStart command

**View current password:**

```bash
sudo cat /etc/infrahaus/credentials | grep OPENCODE_PASSWORD
```

**Change password:**

```bash
# 1. Edit service file
sudo vim /etc/systemd/system/opencode@.service

# 2. Find ExecStart line and update password:
#    ExecStart=/home/%i/.opencode/bin/opencode web --port 8082 --hostname 0.0.0.0 --password "new-password"

# 3. Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart opencode@coder

# 4. Verify
sudo systemctl status opencode@coder
```

**Update credentials file (optional):**

```bash
sudo vim /etc/infrahaus/credentials
# Update: OPENCODE_PASSWORD=new-password
```

## Security Best Practices

### Immediate Actions After Deployment

1. **Retrieve credentials immediately** after container creation
2. **Store in password manager** (1Password, Bitwarden, KeePass, etc.)
3. **Rotate passwords** if the container was created on an untrusted network
4. **Take snapshot** before making security changes
5. **Document container ID and IP** for future reference

### Password Management

**DO:**

- ✅ Use unique passwords for each container
- ✅ Store passwords in a password manager
- ✅ Rotate passwords periodically (every 90 days recommended)
- ✅ Use hashed passwords for code-server when possible
- ✅ Keep credentials file permissions at 600
- ✅ Backup credentials before major system changes

**DON'T:**

- ❌ Share credentials over unencrypted channels
- ❌ Commit credentials to version control
- ❌ Use the same password across multiple containers
- ❌ Store credentials in browser password managers for development containers
- ❌ Disable password authentication for external access

### Network Security

**Firewall Configuration:**

```bash
# ProxmoxVE host - restrict web service access
pct set <container-id> -net0 name=eth0,bridge=vmbr0,firewall=1,ip=dhcp

# Add firewall rules in ProxmoxVE web UI:
# 1. Allow 8080-8082 from specific IP ranges only
# 2. Block all other incoming connections to these ports
```

**ProxmoxVE Firewall Rules Example:**

| Direction | Action | Protocol | Source         | Dest Port | Comment          |
| --------- | ------ | -------- | -------------- | --------- | ---------------- |
| IN        | ACCEPT | TCP      | 192.168.1.0/24 | 8080-8082 | Allow from LAN   |
| IN        | ACCEPT | TCP      | 10.0.0.5       | 8080-8082 | Allow from VPN   |
| IN        | DROP   | TCP      | any            | 8080-8082 | Block all others |

**HTTPS with Reverse Proxy:**

For production or external access, always use HTTPS:

```nginx
# nginx reverse proxy example
server {
    listen 443 ssl http2;
    server_name code.example.com;

    ssl_certificate /etc/letsencrypt/live/code.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/code.example.com/privkey.pem;

    location / {
        proxy_pass http://<container-ip>:8080;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Accept-Encoding gzip;
    }
}
```

### Container Security

**Unprivileged Containers:**

This template uses unprivileged containers by default for enhanced security:

- Reduced attack surface
- User namespace isolation
- No direct root access to host
- Docker-in-Docker still supported via nested containers

**To verify container mode:**

```bash
# From ProxmoxVE host
pct config <container-id> | grep unprivileged
# Output: unprivileged: 1 (unprivileged) or 0 (privileged)
```

**Sudo Access Restrictions:**

The `coder` user has restricted passwordless sudo for development operations:

```bash
# Allowed without password:
sudo systemctl status <service>
sudo docker ps
sudo git pull
sudo /usr/local/bin/config-sync.sh

# Requires password:
sudo apt install <package>
sudo rm -rf /etc/*
sudo passwd
```

## Credential Recovery

### Lost Credentials

If you've lost your credentials:

**Option 1: Retrieve from container**

```bash
# From ProxmoxVE host
pct exec <container-id> -- cat /etc/infrahaus/credentials
```

**Option 2: Reset passwords**

Follow the service-specific password change procedures above, then update the credentials file.

**Option 3: Regenerate (destructive)**

⚠️ **WARNING:** This will reset all services

```bash
# Enter container
pct enter <container-id>

# Remove old credentials
sudo rm /etc/infrahaus/credentials

# Re-run configuration scripts
sudo systemctl restart config-manager

# Wait for completion
journalctl -u config-manager -f
```

### Credentials File Corrupted

If `/etc/infrahaus/credentials` is corrupted:

```bash
# Enter container
pct enter <container-id>

# Manually recreate file
sudo tee /etc/infrahaus/credentials << 'EOF'
# Generated credentials for Web3 Dev Container
CODE_SERVER_PASSWORD=your-password-here
FILEBROWSER_USERNAME=admin
FILEBROWSER_PASSWORD=your-password-here
OPENCODE_PASSWORD=your-password-here
EOF

# Set correct permissions
sudo chmod 600 /etc/infrahaus/credentials
sudo chown root:root /etc/infrahaus/credentials

# Verify each service uses these passwords
# Follow service-specific password change procedures if needed
```

## Monitoring & Auditing

### Service Status Monitoring

**Check all web services:**

```bash
# Quick status
systemctl status code-server@coder filebrowser opencode@coder

# Detailed logs
journalctl -u code-server@coder -n 50
journalctl -u filebrowser -n 50
journalctl -u opencode@coder -n 50
```

### Failed Login Attempts

**Code-server logs:**

```bash
# Check for authentication failures
journalctl -u code-server@coder | grep -i "auth"
journalctl -u code-server@coder | grep -i "password"
```

**FileBrowser logs:**

```bash
# Check for failed logins
journalctl -u filebrowser | grep -i "fail"
journalctl -u filebrowser | grep -i "login"
```

### Connection Monitoring

**Active connections:**

```bash
# See who's connected to web services
ss -tnp | grep ':808'

# Continuous monitoring
watch -n 1 'ss -tnp | grep ":808"'
```

## Troubleshooting

### Credentials File Not Found

**Symptom:** `/etc/infrahaus/credentials` doesn't exist

**Cause:** Config-manager hasn't completed initial setup

**Solution:**

```bash
# Check config-manager status
journalctl -u config-manager -f

# If failed, check for errors
journalctl -u config-manager -n 100

# Manually trigger
sudo systemctl restart config-manager
```

### Wrong Password Accepted

**Symptom:** Service accepts different password than in credentials file

**Cause:** Password was changed but credentials file wasn't updated

**Solution:**

```bash
# The credentials file is for reference only
# Each service stores passwords independently
# Update the credentials file to match actual passwords
sudo vim /etc/infrahaus/credentials
```

### Password Not Working

**Symptom:** Cannot login with password from credentials file

**Causes & Solutions:**

1. **Service not started:**

   ```bash
   sudo systemctl status code-server@coder
   sudo systemctl start code-server@coder
   ```

2. **Wrong password retrieved:**

   ```bash
   # Ensure you're reading the correct credential
   grep CODE_SERVER_PASSWORD /etc/infrahaus/credentials
   ```

3. **Password contains special characters:**

   ```bash
   # Check if password has quotes or spaces
   cat /etc/infrahaus/credentials
   # Copy-paste exactly as shown
   ```

4. **Service configuration mismatch:**
   ```bash
   # Check service file password
   sudo cat /etc/systemd/system/code-server@.service | grep PASSWORD
   ```

### Service Won't Start After Password Change

**Symptom:** Service fails to start after changing password

**Solution:**

```bash
# Check service logs for errors
sudo journalctl -u code-server@coder -n 50

# Common issues:
# 1. Syntax error in service file
sudo systemctl daemon-reload
sudo systemctl restart code-server@coder

# 2. Missing daemon-reload
sudo systemctl daemon-reload

# 3. Invalid password format (special chars)
# Edit service file and quote password properly
sudo vim /etc/systemd/system/code-server@.service
```

## Migration & Backup

### Backup Credentials

**Before any major changes:**

```bash
# From ProxmoxVE host
pct exec <container-id> -- cat /etc/infrahaus/credentials > container-<container-id>-credentials.txt

# Store securely (encrypt if committing to git)
gpg -c container-<container-id>-credentials.txt
```

### Container Migration

**When migrating to new host:**

1. **Backup credentials** before migration
2. **Take container snapshot**
3. **Migrate container** using ProxmoxVE tools
4. **Verify credentials file** exists on new host
5. **Test service access** with saved credentials

### Container Cloning

**When cloning containers:**

⚠️ **IMPORTANT:** Cloned containers will have **identical credentials**

```bash
# After cloning, regenerate credentials
pct enter <new-container-id>
sudo rm /etc/infrahaus/credentials
sudo systemctl restart config-manager

# Or manually change passwords for each service
```

## Related Documentation

- [Main README](./README.md) - Template overview and quick start
- [Testing Guide](./TESTING.md) - Container testing procedures
- [Config-Manager Documentation](../../scripts/config-manager/) - Configuration system details

## Support

For issues or questions:

- GitHub Issues: https://github.com/kethalia/infrahaus/issues
- Check troubleshooting section above
- Review config-manager logs: `journalctl -u config-manager`

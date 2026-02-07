# Phase 7: VM to Run OpenClaw - Research

**Researched:** 2026-02-07
**Domain:** Desktop VM template creation for OpenClaw with full GUI application support
**Confidence:** HIGH

## Summary

OpenClaw requires a desktop environment to run GUI applications effectively, not a headless server deployment. Based on user requirements, this phase involves creating a Debian 13 "Trixie" VM template with minimal desktop environment, auto-login, VNC/remote desktop capability, and pre-installed applications (Chrome, Node.js).

The standard approach is using Debian 13 cloud images as base, adding desktop environment through cloud-init automation, and configuring for unattended GUI operation. This differs significantly from typical server deployments as it requires X11/Wayland display server, window manager, and remote access solutions.

**Key requirements:** Debian 13 base, minimal desktop (XFCE/LXQt), auto-login, VNC server, Chrome browser, Node.js 22+, and QEMU guest agent for Proxmox integration.

**Primary recommendation:** Use the ProxmoxVE community Debian 13 VM script as foundation, with minimal cloud-init for user/SSH bootstrap. All desktop software is installed via modular, idempotent post-install scripts (single source of truth).

## User Constraints (from Requirements)

### Locked Decisions

- **Base OS:** Debian 13 "Trixie" (not Ubuntu)
- **Environment:** Desktop environment with GUI support (not headless)
- **Auto-login:** Automatic login and X server startup required
- **Applications:** Chrome browser and Node.js runtime required
- **Remote Access:** VNC/remote desktop capability required
- **Integration:** QEMU guest agent for Proxmox management required

### Purpose

- **Primary Use:** OpenClaw with full GUI application support
- **Requirement:** Must run "almost any application" with GUI

## Standard Stack

### Core Desktop Stack

| Component | Version       | Purpose             | Why Standard                                |
| --------- | ------------- | ------------------- | ------------------------------------------- |
| Debian    | 13 "Trixie"   | Base OS             | User requirement, current stable release    |
| XFCE      | 4.18+         | Desktop Environment | Lightweight, stable, minimal resource usage |
| LightDM   | Latest        | Display Manager     | Lightweight, easy auto-login configuration  |
| TigerVNC  | Latest        | VNC Server          | High-performance VNC implementation         |
| Node.js   | 22+           | Runtime             | OpenClaw requirement, latest LTS            |
| Chrome    | Latest Stable | Browser             | User requirement for GUI applications       |

### Supporting Infrastructure

| Component        | Version | Purpose        | When to Use                 |
| ---------------- | ------- | -------------- | --------------------------- |
| QEMU Guest Agent | Latest  | VM Integration | Enhanced Proxmox management |
| cloud-init       | Latest  | VM Automation  | Template provisioning       |
| xrdp             | Latest  | RDP Server     | Alternative remote access   |
| Firefox-ESR      | Latest  | Backup Browser | Debian default browser      |

### VM Specifications (Desktop Requirements)

| Resource | Minimum | Recommended | Purpose                                  |
| -------- | ------- | ----------- | ---------------------------------------- |
| RAM      | 2GB     | 4-6GB       | Desktop environment + Node.js + browser  |
| vCPUs    | 2       | 4           | GUI responsiveness + parallel processing |
| Storage  | 16GB    | 32-64GB     | OS + desktop + applications + cache      |
| Display  | VGA     | virtio-gpu  | Better graphics performance              |
| Network  | virtio  | virtio      | Enhanced performance                     |

**Base Image:**

```bash
# Debian 13 cloud images available
wget https://cdimage.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2
```

**Installation Commands:**

```bash
# Inside VM after base image deployment
apt update && apt install -y xfce4 lightdm tigervnc-standalone-server \
    qemu-guest-agent google-chrome-stable nodejs npm
```

## Architecture Patterns

### Recommended VM Template Structure

```
VM Template (ID 9XXX)
├── Debian 13 "Trixie" cloud image base
├── UEFI boot + virtio drivers
├── Cloud-init desktop automation
├── XFCE desktop environment
├── Auto-login configuration
├── VNC server setup
├── Pre-installed applications
└── QEMU guest agent integration
```

### Pattern 1: Minimal Cloud-Init Bootstrap + Post-Install Scripts

**What:** Cloud-init handles minimal bootstrap (user, SSH, basic packages). All desktop software installed via modular post-install scripts — the single source of truth.
**When to use:** For standardized desktop VM template creation
**Note:** Cloud-init is intentionally minimal. Scripts handle software installation for maintainability and re-runnability.

**Minimal cloud-init example (bootstrap only):**

```yaml
# /var/lib/vz/snippets/openclaw-desktop.yaml
#cloud-config
hostname: openclaw-desktop
manage_etc_hosts: true

users:
  - name: openclaw
    groups: sudo,audio,video,render
    shell: /bin/bash
    sudo: ALL=(ALL) ALL
    lock_passwd: false

package_update: true
packages:
  - curl
  - wget
  - ca-certificates
  - gnupg
  - openssh-server
  - git

runcmd:
  - systemctl enable ssh
  - systemctl start ssh
```

**Post-install scripts then handle (see Plan 02):**

- Desktop environment (XFCE + LightDM + auto-login)
- Chrome browser (via modern GPG keyring, not deprecated apt-key)
- Node.js 22+ (via NodeSource)
- TigerVNC remote access
- OpenClaw installation
- QEMU guest agent

### Pattern 2: Auto-Login Configuration

**What:** Unattended boot to desktop environment
**When to use:** For kiosk-mode or automated desktop applications
**Example:**

```bash
# LightDM auto-login configuration
# /etc/lightdm/lightdm.conf
[Seat:*]
autologin-user=openclaw
autologin-user-timeout=0
greeter-session=lightdm-gtk-greeter
```

### Pattern 3: VNC Server Setup

**What:** Remote desktop access via VNC protocol
**When to use:** For headless VM access with full desktop
**Example:**

```bash
# VNC server configuration
# /etc/systemd/system/vncserver@.service
[Unit]
Description=Start TigerVNC server at startup
After=syslog.target network.target

[Service]
Type=forking
User=openclaw
Group=openclaw
WorkingDirectory=/home/openclaw
ExecStartPre=-/usr/bin/vncserver -kill :%i > /dev/null 2>&1
ExecStart=/usr/bin/vncserver -depth 24 -geometry 1920x1080 :%i
ExecStop=/usr/bin/vncserver -kill :%i

[Install]
WantedBy=multi-user.target
```

### Anti-Patterns to Avoid

- **Headless server approach:** OpenClaw needs GUI applications, not CLI-only
- **Heavy desktop environments:** GNOME/KDE consume too many resources for VM
- **Manual configuration:** Use cloud-init for reproducible deployments
- **Insecure VNC:** Always set VNC passwords, consider SSH tunneling

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                   | Don't Build                  | Use Instead           | Why                                      |
| ------------------------- | ---------------------------- | --------------------- | ---------------------------------------- |
| Desktop environment setup | Custom window manager config | XFCE task packages    | Proven combination, minimal overhead     |
| Auto-login mechanism      | Custom init scripts          | LightDM configuration | Standard display manager, reliable       |
| Remote desktop protocol   | Custom VNC implementation    | TigerVNC or XRDP      | Mature, secure, well-supported           |
| Browser installation      | Manual .deb downloads        | Official repositories | Automatic updates, dependency resolution |
| Node.js installation      | Manual compilation           | NodeSource packages   | Current versions, proper integration     |

**Key insight:** Desktop Linux has mature, well-tested components for all required functionality. Custom solutions introduce maintenance overhead and security risks.

## Common Pitfalls

### Pitfall 1: Resource Underallocation

**What goes wrong:** Desktop becomes unresponsive, applications crash, poor user experience
**Why it happens:** Underestimating desktop environment + browser + Node.js memory usage
**How to avoid:** Allocate minimum 4GB RAM, preferably 6GB for smooth operation
**Warning signs:** High swap usage, application startup failures, GUI lag

### Pitfall 2: Display Driver Issues

**What goes wrong:** Black screen, display corruption, VNC connection problems
**Why it happens:** Incorrect display adapter configuration in Proxmox
**How to avoid:** Use 'Standard VGA' or 'virtio-gpu' display adapter, configure VNC properly
**Warning signs:** No desktop after login, corrupted display, VNC shows blank screen

### Pitfall 3: Auto-Login Security Risks

**What goes wrong:** Unauthorized access to desktop if VM console is accessible
**Why it happens:** Auto-login bypasses authentication completely
**How to avoid:** Secure VM console access, use VNC passwords, consider SSH key-only access
**Warning signs:** Unauthorized desktop access, security audit failures

### Pitfall 4: Network Service Conflicts

**What goes wrong:** VNC server fails to start, port conflicts, connection refused
**Why it happens:** Multiple remote desktop services or incorrect port configuration
**How to avoid:** Choose one remote access method (VNC or RDP), configure firewall properly
**Warning signs:** VNC connection failures, port binding errors

### Pitfall 5: Cloud-Init Desktop Timing

**What goes wrong:** Desktop components install before dependencies, service startup failures
**Why it happens:** Cloud-init package installation order and service dependencies
**How to avoid:** Use proper cloud-init phases, test automation thoroughly
**Warning signs:** Failed package installations, services not starting automatically

## Code Examples

Verified patterns from official sources:

### Proxmox VM Template Creation

```bash
# Source: Proxmox documentation + Debian cloud images
export VMID=9007 STORAGE=local-zfs
wget https://cdimage.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2
qemu-img resize debian-13-generic-amd64.qcow2 64G

qm create $VMID --name "openclaw-desktop-template" --ostype l26 \
    --memory 4096 --agent 1 \
    --bios ovmf --machine q35 --efidisk0 $STORAGE:0,pre-enrolled-keys=0 \
    --cpu host --sockets 1 --cores 4 \
    --vga virtio --serial0 socket \
    --net0 virtio,bridge=vmbr0

qm importdisk $VMID debian-13-generic-amd64.qcow2 $STORAGE
qm set $VMID --scsihw virtio-scsi-pci --virtio0 $STORAGE:vm-$VMID-disk-1,discard=on
qm set $VMID --boot order=virtio0
qm set $VMID --scsi1 $STORAGE:cloudinit
qm set $VMID --cicustom "user=local:snippets/openclaw-desktop.yaml"
```

### Software Installation (via post-install scripts)

**Note:** Software installation is handled by numbered post-install scripts, not cloud-init. See Plan 07-02 for the canonical implementation. Key patterns used in scripts:

```bash
# Chrome — use modern GPG keyring (NOT deprecated apt-key)
curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
  | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] \
  http://dl.google.com/linux/chrome/deb/ stable main" \
  > /etc/apt/sources.list.d/google-chrome.list
apt-get update && apt-get install -y google-chrome-stable

# VNC — password set during script execution (user-configurable)
sudo -u openclaw mkdir -p /home/openclaw/.vnc
echo "<VNC_PASSWORD>" | sudo -u openclaw vncpasswd -f > /home/openclaw/.vnc/passwd
chmod 600 /home/openclaw/.vnc/passwd
```

## State of the Art

| Old Approach                | Current Approach                | When Changed | Impact                           |
| --------------------------- | ------------------------------- | ------------ | -------------------------------- |
| Manual desktop setup        | Cloud-init automation           | 2020+        | Reproducible desktop deployments |
| VNC-only access             | Multiple protocols (VNC/RDP)    | 2022+        | Better client compatibility      |
| System Node.js packages     | NodeSource repositories         | 2024+        | Current versions, better support |
| Heavy desktop (GNOME/KDE)   | Lightweight (XFCE/LXQt)         | 2023+        | Better VM performance            |
| Manual browser installation | Official repository integration | 2021+        | Automatic updates                |

**Deprecated/outdated:**

- Ubuntu-based templates: User specifies Debian 13
- Headless-only approach: OpenClaw requires GUI applications
- Manual VNC configuration: Use systemd services for reliability

## Open Questions

Things that couldn't be fully resolved:

1. **OpenClaw Specific Requirements**
   - What we know: OpenClaw runs on Node.js and needs GUI application support
   - What's unclear: Specific browser automation requirements, resource scaling
   - Recommendation: Start with standard desktop template, monitor resource usage

2. **Display Performance Optimization**
   - What we know: VirtIO-GPU provides better performance than VGA
   - What's unclear: OpenClaw's graphics requirements for browser automation
   - Recommendation: Test both VGA and virtio-gpu, measure performance difference

3. **Remote Access Security**
   - What we know: VNC requires passwords, can be tunneled over SSH
   - What's unclear: User's specific security requirements for remote access
   - Recommendation: Implement basic VNC security, document SSH tunneling option

## Sources

### Primary (HIGH confidence)

- https://cdimage.debian.org/images/cloud/trixie/ - Official Debian 13 cloud images
- https://wiki.debian.org/DesktopEnvironment - Debian desktop environment options
- https://pve.proxmox.com/wiki/Cloud-Init_Support - Proxmox cloud-init integration
- https://wiki.debian.org/LightDM - LightDM auto-login configuration

### Secondary (MEDIUM confidence)

- https://wiki.debian.org/VNCviewer - VNC server options for Debian
- https://github.com/nodesource/distributions - Node.js installation for Debian
- https://www.debian.org/releases/trixie/ - Debian 13 release information

### Tertiary (LOW confidence)

- Community discussions about desktop VM performance optimization
- VNC security best practices (needs official verification)

## Metadata

**Confidence breakdown:**

- Base OS (Debian 13): HIGH - Official release, cloud images available
- Desktop stack (XFCE/LightDM): HIGH - Standard Debian packages, well-documented
- Cloud-init automation: HIGH - Proven Proxmox integration
- VNC remote access: MEDIUM - Multiple implementation options available
- Resource requirements: MEDIUM - Based on desktop + Node.js + browser patterns

**Research date:** 2026-02-07
**Valid until:** 90 days (stable desktop technology stack)
**Validation needed:** OpenClaw-specific resource requirements, display performance testing

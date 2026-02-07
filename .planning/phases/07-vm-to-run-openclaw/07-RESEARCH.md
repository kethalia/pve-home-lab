# Phase 7: VM to Run OpenClaw - Research

**Researched:** 2026-02-07
**Domain:** VM template creation & OpenClaw AI assistant deployment
**Confidence:** MEDIUM

## Summary

OpenClaw is a personal AI assistant platform that runs a local Gateway service supporting multiple communication channels (WhatsApp, Telegram, Slack, Discord, etc.). The project requires creating a VM template for Proxmox VE that can run OpenClaw with its Node.js dependencies and optional containerization support.

**Key requirements:** Node.js 22+, at least 2GB RAM, network connectivity for API calls, and optional Docker support for sandboxing. Standard Ubuntu/Debian server template with cloud-init automation is the recommended approach.

**Primary recommendation:** Create Ubuntu 24.04 LTS cloud-init template with automated OpenClaw installation via cloud-config scripts.

## Standard Stack

### Core Requirements

| Component | Version   | Purpose             | Why Standard                                    |
| --------- | --------- | ------------------- | ----------------------------------------------- |
| Ubuntu    | 24.04 LTS | Base OS             | Long-term support, cloud-init compatibility     |
| Node.js   | 22+       | Runtime             | Required by OpenClaw, latest LTS recommended    |
| npm/pnpm  | Latest    | Package manager     | OpenClaw installation and dependency management |
| Docker    | Latest    | Optional sandboxing | Tool isolation for multi-user scenarios         |

### Supporting Infrastructure

| Component        | Version | Purpose        | When to Use                 |
| ---------------- | ------- | -------------- | --------------------------- |
| Proxmox VE       | 8.x     | Hypervisor     | VM hosting platform         |
| Cloud-init       | Latest  | VM automation  | Template standardization    |
| QEMU Guest Agent | Latest  | VM integration | Enhanced Proxmox management |

### VM Specifications (Minimum/Recommended)

| Resource | Minimum | Recommended | Purpose                            |
| -------- | ------- | ----------- | ---------------------------------- |
| RAM      | 1GB     | 2-4GB       | Node.js application + dependencies |
| vCPUs    | 1       | 2           | Concurrent request handling        |
| Storage  | 8GB     | 16-32GB     | OS + application + logs            |
| Network  | 1 Gbps  | 1 Gbps      | API calls to AI providers          |

**Installation:**

```bash
# On target VM
curl -fsSL https://openclaw.ai/install.sh | bash
# or manual
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

## Architecture Patterns

### Recommended VM Template Structure

```
VM Template (ID 8XXX)
├── Ubuntu 24.04 LTS base
├── UEFI boot + virtio-scsi
├── Cloud-init configuration
├── Automated OpenClaw setup
└── Optional Docker for sandboxing
```

### Pattern 1: Cloud-Init Automation

**What:** Automated VM provisioning with OpenClaw pre-installation
**When to use:** For standardized, repeatable deployments
**Example:**

```yaml
# /var/lib/vz/snippets/openclaw-vendor.yaml
#cloud-config
runcmd:
  - apt update && apt install -y curl
  - curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
  - systemctl enable openclaw-gateway
  - reboot
```

### Pattern 2: Docker Sandbox Mode

**What:** Container isolation for multi-tenant or security-conscious deployments
**When to use:** When multiple users or untrusted content processing
**Example:**

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main",
        scope: "agent",
        docker: {
          image: "openclaw-sandbox:bookworm-slim",
        },
      },
    },
  },
}
```

### Anti-Patterns to Avoid

- **Single-core VMs:** OpenClaw benefits from multiple cores for concurrent processing
- **Insufficient RAM:** Node.js applications have high memory overhead
- **No network access:** OpenClaw requires internet connectivity for AI API calls

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem             | Don't Build          | Use Instead                              | Why                                               |
| ------------------- | -------------------- | ---------------------------------------- | ------------------------------------------------- |
| VM provisioning     | Manual setup scripts | Proxmox cloud-init templates             | Standardization, reliability, Proxmox integration |
| Process management  | Custom init scripts  | systemd services                         | Native OS integration, logging, restart policies  |
| Container isolation | Custom sandboxing    | OpenClaw's built-in Docker support       | Security-tested, documented configuration         |
| SSL/TLS termination | Custom proxy setup   | Tailscale Serve/Funnel or standard nginx | Built-in OpenClaw feature or proven solutions     |

**Key insight:** OpenClaw has sophisticated built-in tooling for deployment, sandboxing, and networking that shouldn't be reimplemented.

## Common Pitfalls

### Pitfall 1: Node.js Version Mismatch

**What goes wrong:** Using older Node.js versions (16, 18, 20) causes compatibility issues
**Why it happens:** System package managers often ship outdated Node.js
**How to avoid:** Use NodeSource repository or installer script that handles Node.js installation
**Warning signs:** Installation failures, runtime errors about unsupported features

### Pitfall 2: Insufficient VM Resources

**What goes wrong:** High memory usage, slow response times, timeouts
**Why it happens:** Node.js + AI model processing is resource-intensive
**How to avoid:** Allocate at least 2GB RAM, prefer 4GB for production use
**Warning signs:** Out-of-memory errors, slow gateway startup, request timeouts

### Pitfall 3: Network Connectivity Issues

**What goes wrong:** OpenClaw gateway fails to reach AI provider APIs
**Why it happens:** Firewall rules, proxy settings, or DNS issues
**How to avoid:** Test external connectivity during template creation
**Warning signs:** API authentication failures, model request timeouts

### Pitfall 4: Docker Permission Problems

**What goes wrong:** Sandbox containers fail to start or access files
**Why it happens:** Docker socket permissions, user namespace conflicts
**How to avoid:** Add openclaw user to docker group, verify Docker daemon is running
**Warning signs:** "Permission denied" errors when using sandbox features

## Code Examples

Verified patterns from official sources:

### Cloud-Init Template Creation

```bash
# Source: Proxmox best practices + OpenClaw docs
export VMID=8007 STORAGE=local-zfs
wget -q https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
qemu-img resize noble-server-cloudimg-amd64.img 32G

qm create $VMID --name "openclaw-template" --ostype l26 \
    --memory 4096 --agent 1 \
    --bios ovmf --machine q35 --efidisk0 $STORAGE:0,pre-enrolled-keys=0 \
    --cpu host --sockets 1 --cores 2 \
    --vga serial0 --serial0 socket \
    --net0 virtio,bridge=vmbr0

qm importdisk $VMID noble-server-cloudimg-amd64.img $STORAGE
qm set $VMID --scsihw virtio-scsi-pci --virtio0 $STORAGE:vm-$VMID-disk-1,discard=on
qm set $VMID --boot order=virtio0
qm set $VMID --scsi1 $STORAGE:cloudinit
```

### OpenClaw Installation Script

```yaml
# Source: https://docs.openclaw.ai/install
#cloud-config
users:
  - name: openclaw
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - ssh-rsa AAAAB3...

runcmd:
  - apt update && apt install -y curl docker.io
  - usermod -aG docker openclaw
  - sudo -u openclaw bash -c 'curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard'
  - systemctl enable docker
  - reboot
```

## State of the Art

| Old Approach            | Current Approach            | When Changed  | Impact                          |
| ----------------------- | --------------------------- | ------------- | ------------------------------- |
| Manual VM setup         | Cloud-init automation       | 2020+         | Reproducible deployments        |
| System Node.js packages | NodeSource/installer script | 2024+         | Current versions, compatibility |
| Custom sandboxing       | Docker-based isolation      | OpenClaw 2024 | Security, standardization       |
| Direct API deployment   | Tailscale integration       | OpenClaw 2024 | Secure remote access            |

**Deprecated/outdated:**

- Manual Node.js compilation: Use installer script or NodeSource packages
- Host-only deployment: Consider Docker sandboxing for security

## Open Questions

Things that couldn't be fully resolved:

1. **GPU Requirements**
   - What we know: OpenClaw supports browser automation which may benefit from GPU
   - What's unclear: Whether GPU passthrough improves performance significantly
   - Recommendation: Start with CPU-only template, evaluate GPU needs based on usage

2. **Optimal Resource Allocation**
   - What we know: Minimum 2GB RAM, benefits from multiple cores
   - What's unclear: Exact scaling characteristics under load
   - Recommendation: Monitor resource usage and adjust template defaults

## Sources

### Primary (HIGH confidence)

- https://docs.openclaw.ai - OpenClaw official documentation
- https://github.com/openclaw/openclaw - Main repository with installation instructions
- https://docs.openclaw.ai/install - Installation requirements and methods

### Secondary (MEDIUM confidence)

- https://github.com/UntouchedWagons/Ubuntu-CloudInit-Docs - Proxmox VM template best practices
- Proxmox VE documentation for cloud-init integration

### Tertiary (LOW confidence)

- GitHub search results for Proxmox automation patterns

## Metadata

**Confidence breakdown:**

- OpenClaw requirements: HIGH - Official documentation available
- VM template creation: MEDIUM - Standard Proxmox patterns, need to verify specifics
- Resource requirements: MEDIUM - Based on Node.js application patterns, needs validation

**Research date:** 2026-02-07
**Valid until:** 60 days (stable technology stack)

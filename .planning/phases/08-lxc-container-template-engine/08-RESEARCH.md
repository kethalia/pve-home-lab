# Phase 08: Proxmox LXC Container Template Engine - Research

**Researched:** 2026-02-08
**Domain:** Bash shell tooling, Proxmox pct commands, YAML parsing, LXC container provisioning
**Confidence:** HIGH

## Summary

This phase builds a standalone, config-driven LXC container template engine using bash scripts, yq for YAML parsing, and Proxmox `pct` commands for container lifecycle management. The system is SEPARATE from the existing `infra/lxc/` dashboard-oriented system — it lives at `templates/` in the repo root and runs directly on the Proxmox host.

The user has already made all key architectural decisions: declarative `template.yaml`, convention-based directory structure (`scripts/`, `files/`, `hooks/`), `deploy.sh` as the entry point, `yq` (Go version) for YAML parsing, numbered scripts (`00_`, `01_`, ..., `99_`), engine/template separation, USER placeholder replacement, and `.deploy-state` for resume capability.

Research focused on: (1) exact installation commands for every tool in the forge-shield template, (2) pct command API specifics, (3) yq patterns for bash, (4) LXC provisioning pitfalls, and (5) which tools won't work in unprivileged LXC containers.

**Primary recommendation:** Build the engine first with comprehensive error handling and state management, then implement forge-shield scripts one-by-one with idempotency guards, testing each tool installation in an actual LXC container since several tools have subtle PATH, permissions, or dependency requirements.

## User Constraints (from Phase Prompt)

No CONTEXT.md exists, but the user provided extremely detailed specifications in the phase prompt. These are treated as locked decisions:

### Locked Decisions (from phase prompt)

- `template.yaml` as declarative config format (YAML, not bash-based conf)
- Convention-based directory structure: `scripts/`, `files/`, `hooks/`
- `deploy.sh` as main entry point running on the Proxmox host
- `yq` (Go version by mikefarah) for YAML parsing
- `pct` commands for container interaction (create, push, exec, start, stop, destroy)
- Numbered script convention: `00_`, `01_`, ..., `99_`
- Engine/template separation: `engine/` is reusable, `forge-shield/` is first template
- `USER` placeholder replacement in file paths
- State file (`.deploy-state`) for resume capability
- Ubuntu 24.04 as the container OS
- Unprivileged LXC container with nesting enabled

### Claude's Discretion

- Exact helper function signatures and internal engine module breakdown
- Error handling strategy details (retry counts, timeouts)
- Logging format and verbosity levels
- State file format (JSON vs flat key=value)
- Hook execution semantics (pre-create, post-create, pre-script, post-script, etc.)

## Standard Stack

### Core Tools (on Proxmox Host)

| Tool | Version            | Purpose                     | Install Method                |
| ---- | ------------------ | --------------------------- | ----------------------------- |
| yq   | v4.x (latest)      | Parse template.yaml in bash | wget binary to /usr/local/bin |
| pct  | (bundled with PVE) | LXC container lifecycle     | Pre-installed on Proxmox      |
| bash | 5.x                | Script execution            | Pre-installed                 |
| curl | any                | Download installers         | Pre-installed                 |

### Forge-Shield Template Tools (Inside Container)

| Tool                                     | Purpose                                    | Install Method                                                                                                                | Confidence |
| ---------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Foundry** (forge, cast, anvil, chisel) | EVM development toolkit                    | `curl -L https://foundry.paradigm.xyz \| bash` then `foundryup`                                                               | HIGH       |
| **Claude Code CLI**                      | AI coding assistant                        | `curl -fsSL https://claude.ai/install.sh \| bash`                                                                             | HIGH       |
| **OpenCode**                             | Web-based code editor                      | `curl -fsSL https://opencode.ai/install \| bash`                                                                              | HIGH       |
| **Slither**                              | Solidity static analyzer                   | `pip3 install slither-analyzer` (requires Python 3.10+)                                                                       | HIGH       |
| **Mythril**                              | Symbolic execution analyzer                | `pip3 install mythril` (requires Python 3.7-3.10, has z3 dependency)                                                          | MEDIUM     |
| **Echidna**                              | Smart contract fuzzer                      | Download prebuilt binary from GitHub releases                                                                                 | HIGH       |
| **Aderyn**                               | Rust-based Solidity analyzer               | `curl --proto '=https' --tlsv1.2 -LsSf https://github.com/cyfrin/aderyn/releases/latest/download/aderyn-installer.sh \| bash` | HIGH       |
| **solc-select**                          | Solidity compiler manager                  | `pip3 install solc-select`                                                                                                    | HIGH       |
| **solhint**                              | Solidity linter                            | `npm install -g solhint`                                                                                                      | HIGH       |
| **Semgrep**                              | Multi-language static analysis             | `pip3 install semgrep`                                                                                                        | HIGH       |
| **Trivy**                                | Container/filesystem vulnerability scanner | wget binary from GitHub releases                                                                                              | HIGH       |
| **Gitleaks**                             | Secret detection in git repos              | wget binary from GitHub releases                                                                                              | HIGH       |
| **OWASP ZAP**                            | Web app security scanner                   | `apt install zaproxy` OR download from GitHub releases                                                                        | MEDIUM     |

## Architecture Patterns

### Recommended Project Structure

```
templates/
├── engine/                        # Reusable engine (NOT template-specific)
│   ├── deploy.sh                  # Main entry point
│   ├── lib/
│   │   ├── config.sh              # yq-based YAML config reader
│   │   ├── container.sh           # pct wrapper functions
│   │   ├── logging.sh             # Colored logging (info/warn/error/debug)
│   │   ├── state.sh               # .deploy-state management (resume/retry)
│   │   ├── files.sh               # File push with USER placeholder replacement
│   │   └── hooks.sh               # Hook execution (pre/post lifecycle)
│   └── README.md
├── forge-shield/                  # First template
│   ├── template.yaml              # Declarative configuration
│   ├── scripts/                   # Numbered provisioning scripts
│   │   ├── 00_base-packages.sh
│   │   ├── 01_user-setup.sh
│   │   ├── 02_nodejs-setup.sh
│   │   ├── 03_python-setup.sh
│   │   ├── 10_foundry.sh
│   │   ├── 11_solc-select.sh
│   │   ├── 12_solhint.sh
│   │   ├── 20_slither.sh
│   │   ├── 21_mythril.sh
│   │   ├── 22_echidna.sh
│   │   ├── 23_aderyn.sh
│   │   ├── 30_semgrep.sh
│   │   ├── 31_trivy.sh
│   │   ├── 32_gitleaks.sh
│   │   ├── 33_zap.sh
│   │   ├── 40_claude-code.sh
│   │   ├── 41_opencode.sh
│   │   └── 99_finalize.sh
│   ├── files/                     # Files to push into container
│   │   ├── home/USER/.bashrc
│   │   ├── home/USER/.gitconfig
│   │   └── etc/motd
│   └── hooks/                     # Lifecycle hooks
│       ├── pre-create.sh
│       └── post-deploy.sh
└── README.md
```

### Pattern 1: yq YAML Parsing in Bash

**What:** Read template.yaml values using yq jq-like syntax
**When to use:** Every config read operation in deploy.sh

```bash
# Source: https://github.com/mikefarah/yq (README verified 2026-02-08)

# Read simple values
CTID=$(yq '.container.vmid' "$TEMPLATE_DIR/template.yaml")
HOSTNAME=$(yq '.container.hostname' "$TEMPLATE_DIR/template.yaml")
MEMORY=$(yq '.container.resources.memory' "$TEMPLATE_DIR/template.yaml")
CORES=$(yq '.container.resources.cores' "$TEMPLATE_DIR/template.yaml")

# Read with defaults using // (alternative operator)
STORAGE=$(yq '.container.storage // "local-lvm"' "$TEMPLATE_DIR/template.yaml")
OSTEMPLATE=$(yq '.container.ostemplate // "local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst"' "$TEMPLATE_DIR/template.yaml")

# Read arrays (e.g., list of features)
FEATURES=$(yq '.container.features | join(",")' "$TEMPLATE_DIR/template.yaml")

# Check if key exists
if yq -e '.container.ssh_keys' "$TEMPLATE_DIR/template.yaml" >/dev/null 2>&1; then
    SSH_KEYS=$(yq '.container.ssh_keys' "$TEMPLATE_DIR/template.yaml")
fi

# Read network config
BRIDGE=$(yq '.container.network.bridge // "vmbr0"' "$TEMPLATE_DIR/template.yaml")
IP=$(yq '.container.network.ip // "dhcp"' "$TEMPLATE_DIR/template.yaml")
GW=$(yq '.container.network.gateway // ""' "$TEMPLATE_DIR/template.yaml")

# Iterate over scripts
yq -r '.scripts[]' "$TEMPLATE_DIR/template.yaml" | while read -r script; do
    echo "Running: $script"
done

# Environment variables from YAML
yq -r '.env | to_entries | .[] | .key + "=" + .value' "$TEMPLATE_DIR/template.yaml"
```

### Pattern 2: pct Container Lifecycle

**What:** Create, provision, and manage LXC containers using pct
**When to use:** Container creation and all interactions from the Proxmox host

```bash
# Source: https://pve.proxmox.com/pve-docs/pct.1.html (verified 2026-02-08, PVE 9.1.2)

# Create container
pct create "$CTID" "$OSTEMPLATE" \
    --hostname "$HOSTNAME" \
    --memory "$MEMORY" \
    --cores "$CORES" \
    --rootfs "$STORAGE:$DISK_SIZE" \
    --net0 "name=eth0,bridge=$BRIDGE,ip=$IP,gw=$GW" \
    --unprivileged 1 \
    --features "nesting=1,keyctl=1" \
    --ostype ubuntu \
    --password "$ROOT_PASSWORD" \
    --start 0

# Start container
pct start "$CTID"

# Wait for container to be running
while ! pct status "$CTID" | grep -q "running"; do
    sleep 1
done

# Push file into container (from host to container)
# IMPORTANT: pct push works on RUNNING containers
pct push "$CTID" /tmp/local-file.sh /tmp/remote-file.sh
pct push "$CTID" /tmp/local-file.sh /tmp/remote-file.sh --perms 0755
pct push "$CTID" /tmp/local-file.sh /home/user/file.sh --user 1000 --group 1000

# Execute command inside container
pct exec "$CTID" -- bash -c "apt-get update && apt-get install -y curl git"
pct exec "$CTID" -- bash -c "source /tmp/env.sh && /tmp/script.sh"

# Execute as specific user (run bash as user, not as root)
pct exec "$CTID" -- su - username -c "command here"

# Stop container
pct shutdown "$CTID" --timeout 30
# OR force stop
pct stop "$CTID"

# Destroy container
pct destroy "$CTID" --purge

# Check container status
pct status "$CTID"

# Get container config
pct config "$CTID"

# List containers
pct list
```

### Pattern 3: State File for Resume Capability

**What:** Track which scripts have completed for resume/retry
**When to use:** .deploy-state file management

```bash
# .deploy-state format (simple key=value for bash friendliness)
# STATE_FILE="$TEMPLATE_DIR/.deploy-state"

state_init() {
    local state_file="$1"
    if [[ ! -f "$state_file" ]]; then
        cat > "$state_file" <<EOF
DEPLOY_STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CTID=$CTID
PHASE=create
LAST_SCRIPT=
COMPLETED_SCRIPTS=
EOF
    fi
}

state_get() {
    local state_file="$1" key="$2"
    grep "^${key}=" "$state_file" 2>/dev/null | cut -d'=' -f2-
}

state_set() {
    local state_file="$1" key="$2" value="$3"
    if grep -q "^${key}=" "$state_file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$state_file"
    else
        echo "${key}=${value}" >> "$state_file"
    fi
}

state_mark_script_done() {
    local state_file="$1" script_name="$2"
    local completed
    completed=$(state_get "$state_file" "COMPLETED_SCRIPTS")
    state_set "$state_file" "COMPLETED_SCRIPTS" "${completed:+$completed,}$script_name"
    state_set "$state_file" "LAST_SCRIPT" "$script_name"
}

state_is_script_done() {
    local state_file="$1" script_name="$2"
    local completed
    completed=$(state_get "$state_file" "COMPLETED_SCRIPTS")
    [[ ",$completed," == *",$script_name,"* ]]
}
```

### Pattern 4: USER Placeholder Replacement in File Paths

**What:** Replace USER in paths like `home/USER/.bashrc` with actual username
**When to use:** When pushing files from template `files/` directory

```bash
# files/home/USER/.bashrc → /home/actualuser/.bashrc
push_template_files() {
    local template_dir="$1" ctid="$2" username="$3"

    find "$template_dir/files" -type f | while read -r local_file; do
        # Strip the template files/ prefix to get container path
        local container_path="/${local_file#"$template_dir/files/"}"
        # Replace USER placeholder
        container_path="${container_path//USER/$username}"

        log_info "Pushing: $local_file → $container_path"

        # Ensure parent directory exists in container
        local parent_dir
        parent_dir=$(dirname "$container_path")
        pct exec "$ctid" -- mkdir -p "$parent_dir"

        # Push file
        pct push "$ctid" "$local_file" "$container_path"
    done
}
```

### Pattern 5: Idempotent Script Design

**What:** Scripts that can be re-run safely
**When to use:** Every provisioning script in scripts/

```bash
#!/usr/bin/env bash
# 10_foundry.sh — Install Foundry (idempotent)
set -euo pipefail

# Guard: skip if already installed
if command -v forge &>/dev/null; then
    echo "[INFO] Foundry already installed: $(forge --version)"
    exit 0
fi

# Install
curl -L https://foundry.paradigm.xyz | bash
export PATH="$HOME/.foundry/bin:$PATH"
foundryup

# Verify
forge --version || { echo "[ERROR] Foundry installation failed"; exit 1; }
```

### Anti-Patterns to Avoid

- **Running pct push on stopped containers:** `pct push` requires the container to be running. Always start first.
- **Relying on PATH in pct exec:** `pct exec` runs with minimal environment. Always use absolute paths or explicitly source profiles.
- **Non-idempotent scripts:** Every script MUST check if its tool is already installed before proceeding.
- **Hard-coding VMID:** Always read from template.yaml; user may want to override.
- **Running everything as root inside container:** Create a non-root user early, run tool installations as that user where possible.

## Don't Hand-Roll

| Problem               | Don't Build                   | Use Instead                                                                    | Why                                                         |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| YAML parsing in bash  | Custom awk/sed parser         | yq (Go version)                                                                | YAML is complex (nested arrays, anchors, multiline strings) |
| Argument parsing      | Manual getopts                | Structured case statement with --help                                          | Keep it simple but complete                                 |
| Colored logging       | Inline echo with escape codes | Shared logging.sh library                                                      | Consistent format, log levels, file output                  |
| Container interaction | Direct LXC commands           | pct wrapper functions                                                          | pct handles namespaces, storage, networking                 |
| Password generation   | Custom random string          | `openssl rand -base64 16` or `tr -dc 'A-Za-z0-9' < /dev/urandom \| head -c 16` | Cryptographically secure                                    |

## Common Pitfalls

### Pitfall 1: pct exec PATH Issues

**What goes wrong:** Tools installed by user-level installers (foundryup, nvm, etc.) aren't in PATH when using `pct exec`
**Why it happens:** `pct exec` runs with a minimal environment, not a login shell. `~/.bashrc` is not sourced.
**How to avoid:** Always use absolute paths or explicitly set PATH:

```bash
pct exec "$CTID" -- bash -c "export PATH='/home/user/.foundry/bin:/home/user/.local/bin:\$PATH' && forge --version"
# OR
pct exec "$CTID" -- su - username -c "forge --version"  # su - sources login profile
```

**Warning signs:** "command not found" errors during provisioning even though install succeeded.

### Pitfall 2: Mythril's z3 Dependency

**What goes wrong:** `pip3 install mythril` fails or takes extremely long (30+ minutes compiling z3)
**Why it happens:** Mythril depends on z3-solver which compiles from source if no wheel is available. On Ubuntu 24.04 aarch64 or unusual architectures, this is common.
**How to avoid:** Install system z3 first: `apt-get install -y python3-z3 libz3-dev`, then pip install mythril. Set a generous timeout. Consider making Mythril optional with a try/catch.
**Warning signs:** pip install hanging for extended periods during z3-solver compilation.

### Pitfall 3: Echidna Binary Compatibility

**What goes wrong:** Echidna downloaded binary doesn't run in LXC container
**Why it happens:** Echidna is a Haskell binary. Pre-built binaries are statically linked for x86_64 Linux but may need glibc compatibility. Also, Echidna requires `slither` to be installed.
**How to avoid:** Download the latest Linux x86_64 release binary. Verify it runs. Install slither first (it's a dependency).

```bash
# Install echidna
ECHIDNA_VERSION=$(curl -s https://api.github.com/repos/crytic/echidna/releases/latest | grep tag_name | cut -d'"' -f4)
wget "https://github.com/crytic/echidna/releases/download/${ECHIDNA_VERSION}/echidna-${ECHIDNA_VERSION}-Linux.zip"
unzip "echidna-${ECHIDNA_VERSION}-Linux.zip" -d /tmp/echidna
mv /tmp/echidna/echidna /usr/local/bin/echidna
chmod +x /usr/local/bin/echidna
```

**Warning signs:** "Segmentation fault" or "GLIBC not found" errors.

### Pitfall 4: LXC Unprivileged Container Limitations

**What goes wrong:** Certain tools fail because they need capabilities not available in unprivileged containers
**Why it happens:** Unprivileged LXC containers map UIDs and have restricted capabilities
**How to avoid:**

- Enable `nesting=1` for Docker-in-LXC (if needed for ZAP Docker mode)
- Enable `keyctl=1` for systemd services
- Most developer tools work fine unprivileged
- ZAP should be installed in headless/daemon mode, not desktop mode
  **Warning signs:** Permission denied errors, systemd service failures, Docker socket issues.

### Pitfall 5: yq Version Confusion

**What goes wrong:** Wrong yq is installed (Python version instead of Go version)
**Why it happens:** `apt install yq` on some distros installs the Python-based `yq` (kislyuk/yq) which has completely different syntax. `snap install yq` installs the correct Go version.
**How to avoid:** Always install the Go binary directly from mikefarah/yq releases:

```bash
wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/local/bin/yq
chmod +x /usr/local/bin/yq
# Verify it's the Go version
yq --version  # Should show "yq (https://github.com/mikefarah/yq/) version v4.x.x"
```

**Warning signs:** "Invalid syntax" errors when using jq-like dot notation.

### Pitfall 6: pct push File Permissions

**What goes wrong:** Files pushed with `pct push` end up with wrong ownership (root:root)
**Why it happens:** `pct push` default ownership is root
**How to avoid:** Use the `--user` and `--group` flags, or `chown` after push:

```bash
pct push "$CTID" /tmp/file /home/user/file --user 1000 --group 1000
# OR
pct push "$CTID" /tmp/file /home/user/file
pct exec "$CTID" -- chown user:user /home/user/file
```

### Pitfall 7: Script Execution Inside Container via pct exec

**What goes wrong:** Complex scripts fail silently or produce confusing errors
**Why it happens:** `pct exec` passes commands through multiple shell layers. Quoting is tricky.
**How to avoid:** Push scripts as files, then execute them:

```bash
# DON'T: Complex inline commands
pct exec "$CTID" -- bash -c "if [ -f /etc/foo ]; then echo 'yes'; fi"

# DO: Push script, then run it
pct push "$CTID" /tmp/script.sh /tmp/script.sh --perms 0755
pct exec "$CTID" -- /tmp/script.sh
pct exec "$CTID" -- rm /tmp/script.sh
```

### Pitfall 8: Ubuntu 24.04 Python Changes

**What goes wrong:** `pip3 install` fails with "externally-managed-environment" error
**Why it happens:** Ubuntu 24.04 (and Debian 12+) enforce PEP 668, preventing system-wide pip installs
**How to avoid:** Use `pipx` for CLI tools, or create a venv, or use `--break-system-packages`:

```bash
# Recommended: use pipx for CLI tools
apt-get install -y pipx
pipx install slither-analyzer
pipx install mythril
pipx install semgrep
pipx install solc-select

# OR: use --break-system-packages (simpler but less clean)
pip3 install --break-system-packages slither-analyzer

# OR: virtual environment
python3 -m venv /opt/security-tools
/opt/security-tools/bin/pip install slither-analyzer mythril semgrep
# Then symlink or add to PATH
```

## Code Examples

### yq Installation on Proxmox Host

```bash
# Source: https://github.com/mikefarah/yq README (verified 2026-02-08)
install_yq() {
    if command -v yq &>/dev/null; then
        log_info "yq already installed: $(yq --version)"
        return 0
    fi

    log_info "Installing yq..."
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64)  arch="amd64" ;;
        aarch64) arch="arm64" ;;
        *)       log_error "Unsupported architecture: $arch"; return 1 ;;
    esac

    wget -q "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${arch}" \
        -O /usr/local/bin/yq
    chmod +x /usr/local/bin/yq

    # Verify
    yq --version || { log_error "yq installation failed"; return 1; }
    log_info "yq installed: $(yq --version)"
}
```

### Complete Forge-Shield Tool Installation Commands

```bash
# ===== PREREQUISITES (inside container) =====

# Base packages
apt-get update && apt-get install -y \
    curl wget git build-essential software-properties-common \
    python3 python3-pip python3-venv pipx \
    unzip jq tree

# Node.js (via nvm or NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Rust (for Aderyn)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# ===== SMART CONTRACT DEV TOOLS =====

# Foundry (forge, cast, anvil, chisel)
curl -L https://foundry.paradigm.xyz | bash
export PATH="$HOME/.foundry/bin:$PATH"
foundryup

# solc-select (Solidity compiler version manager)
pipx install solc-select
solc-select install 0.8.26
solc-select use 0.8.26

# solhint (Solidity linter)
npm install -g solhint

# ===== SECURITY ANALYSIS TOOLS =====

# Slither (static analyzer) — requires Python 3.10+
pipx install slither-analyzer

# Mythril (symbolic execution) — heavy dependency, may take time
# NOTE: z3-solver compilation can be very slow
apt-get install -y libz3-dev
pipx install mythril

# Echidna (fuzzer) — pre-built binary
ECHIDNA_VER=$(curl -s https://api.github.com/repos/crytic/echidna/releases/latest | jq -r .tag_name)
wget -q "https://github.com/crytic/echidna/releases/download/${ECHIDNA_VER}/echidna-${ECHIDNA_VER}-Linux.zip" -O /tmp/echidna.zip
unzip -o /tmp/echidna.zip -d /tmp/echidna-extract
cp /tmp/echidna-extract/echidna /usr/local/bin/
chmod +x /usr/local/bin/echidna
rm -rf /tmp/echidna.zip /tmp/echidna-extract

# Aderyn (Rust-based Solidity analyzer)
curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/cyfrin/aderyn/releases/latest/download/aderyn-installer.sh | bash

# ===== GENERAL SECURITY TOOLS =====

# Semgrep (multi-language static analysis)
pipx install semgrep

# Trivy (vulnerability scanner) — pre-built binary
TRIVY_VER=$(curl -s https://api.github.com/repos/aquasecurity/trivy/releases/latest | jq -r .tag_name | sed 's/^v//')
wget -q "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VER}/trivy_${TRIVY_VER}_Linux-64bit.tar.gz" -O /tmp/trivy.tar.gz
tar xzf /tmp/trivy.tar.gz -C /tmp trivy
mv /tmp/trivy /usr/local/bin/
chmod +x /usr/local/bin/trivy
rm /tmp/trivy.tar.gz

# Gitleaks (secret detection) — pre-built binary
GITLEAKS_VER=$(curl -s https://api.github.com/repos/gitleaks/gitleaks/releases/latest | jq -r .tag_name | sed 's/^v//')
wget -q "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VER}/gitleaks_${GITLEAKS_VER}_linux_x64.tar.gz" -O /tmp/gitleaks.tar.gz
tar xzf /tmp/gitleaks.tar.gz -C /tmp gitleaks
mv /tmp/gitleaks /usr/local/bin/
chmod +x /usr/local/bin/gitleaks
rm /tmp/gitleaks.tar.gz

# OWASP ZAP (web app scanner) — Java-based, headless mode
# NOTE: Large install (~500MB), consider making optional
apt-get install -y default-jre
wget -q "https://github.com/zaproxy/zaproxy/releases/latest/download/ZAP_WEEKLY_unix.tar.gz" -O /tmp/zap.tar.gz
mkdir -p /opt/zaproxy
tar xzf /tmp/zap.tar.gz -C /opt/zaproxy --strip-components=1
ln -sf /opt/zaproxy/zap.sh /usr/local/bin/zap
rm /tmp/zap.tar.gz

# ===== AI CODING TOOLS =====

# Claude Code CLI
curl -fsSL https://claude.ai/install.sh | bash

# OpenCode
curl -fsSL https://opencode.ai/install | bash
```

### deploy.sh Argument Parsing Pattern

```bash
#!/usr/bin/env bash
set -euo pipefail

# Defaults
TEMPLATE_DIR=""
ACTION="deploy"
FORCE=false
RESUME=false
VERBOSE=false
DRY_RUN=false

usage() {
    cat <<EOF
Usage: deploy.sh [OPTIONS] <template-dir>

Deploy an LXC container from a template.

Arguments:
    template-dir    Path to template directory (e.g., ./forge-shield)

Options:
    -a, --action ACTION   Action: deploy|destroy|status (default: deploy)
    -f, --force           Force re-deploy (destroy existing first)
    -r, --resume          Resume from last successful step
    -v, --verbose         Enable verbose output
    -n, --dry-run         Show what would be done without executing
    -h, --help            Show this help message

Examples:
    deploy.sh ./forge-shield
    deploy.sh --resume ./forge-shield
    deploy.sh --action destroy ./forge-shield
    deploy.sh --force --verbose ./forge-shield
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -a|--action)  ACTION="$2"; shift 2 ;;
        -f|--force)   FORCE=true; shift ;;
        -r|--resume)  RESUME=true; shift ;;
        -v|--verbose) VERBOSE=true; shift ;;
        -n|--dry-run) DRY_RUN=true; shift ;;
        -h|--help)    usage ;;
        -*)           echo "Unknown option: $1" >&2; exit 1 ;;
        *)            TEMPLATE_DIR="$1"; shift ;;
    esac
done

[[ -z "$TEMPLATE_DIR" ]] && { echo "Error: template directory required"; usage; }
[[ -d "$TEMPLATE_DIR" ]] || { echo "Error: directory not found: $TEMPLATE_DIR"; exit 1; }
[[ -f "$TEMPLATE_DIR/template.yaml" ]] || { echo "Error: template.yaml not found in $TEMPLATE_DIR"; exit 1; }
```

### template.yaml Example Schema

```yaml
# forge-shield/template.yaml
name: forge-shield
description: "Full-stack EVM dev environment with security tooling"
version: "1.0.0"

container:
  vmid: 200
  hostname: forge-shield
  ostemplate: "local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst"
  ostype: ubuntu

  resources:
    memory: 8192
    swap: 4096
    cores: 4
    disk: 30 # GB

  storage: local-lvm
  unprivileged: true

  features:
    nesting: true
    keyctl: true

  network:
    bridge: vmbr0
    ip: dhcp
    # ip: "192.168.1.200/24"
    # gateway: "192.168.1.1"

  password: "" # Empty = auto-generate
  ssh_keys: "" # Path to SSH public keys file
  onboot: true
  timezone: host

user:
  name: coder
  shell: /bin/bash
  groups:
    - sudo
    - docker

env:
  NODE_VERSION: "22"
  PYTHON_VERSION: "3"
  RUST_INSTALL: "true"

scripts:
  # Ordered list — engine discovers scripts/ directory by convention
  # but this allows override/subset selection
  include: "all" # "all" = run all numbered scripts, or list specific ones
  # include:
  #   - 00_base-packages.sh
  #   - 10_foundry.sh
```

## LXC Container Compatibility Matrix

### Tools That Work Fine in Unprivileged LXC

| Tool            | Notes                                          |
| --------------- | ---------------------------------------------- |
| Foundry         | Pure userspace binary, no special privileges   |
| Claude Code CLI | Node.js-based, runs as user                    |
| OpenCode        | Go binary, runs as user                        |
| Slither         | Python, no special requirements                |
| Aderyn          | Rust binary, no special requirements           |
| solc-select     | Python, downloads solc binaries                |
| solhint         | Node.js npm package                            |
| Semgrep         | Python + OCaml binary, no special requirements |
| Trivy           | Go binary, filesystem scanning works fine      |
| Gitleaks        | Go binary, no special requirements             |

### Tools That Need Attention in Unprivileged LXC

| Tool               | Issue                                      | Workaround                                       |
| ------------------ | ------------------------------------------ | ------------------------------------------------ |
| Mythril            | z3 compilation may need lots of RAM (4GB+) | Pre-install z3 from apt, allocate sufficient RAM |
| Echidna            | Static binary, generally works but test    | Download and verify binary runs                  |
| OWASP ZAP          | Java heap needs tuning, large install      | Set JAVA_OPTS for memory, use headless mode      |
| Docker (if needed) | Needs nesting=1 feature                    | Already specified in template                    |

### Tools That WON'T Work in Unprivileged LXC

| Tool                  | Reason                                                   | Alternative                                |
| --------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Docker (rootful)      | Requires cgroup access; nesting helps but not guaranteed | Use rootless Docker, or run with nesting=1 |
| Raw eBPF tools        | Requires kernel capabilities                             | Not needed for this template               |
| Kernel module loading | No access in unprivileged containers                     | Not needed for this template               |

## State of the Art

| Old Approach                          | Current Approach               | When Changed           | Impact                               |
| ------------------------------------- | ------------------------------ | ---------------------- | ------------------------------------ |
| bash-based template.conf              | YAML-based template.yaml       | This phase             | Much richer config, arrays, nesting  |
| ProxmoxVE community scripts framework | Standalone pct-based deploy.sh | This phase             | No external dependency, simpler      |
| pip install globally                  | pipx for CLI tools             | Ubuntu 24.04 / PEP 668 | Required for Ubuntu 24.04            |
| Python yq (kislyuk)                   | Go yq (mikefarah)              | Standard for years     | jq-like syntax, no Python dependency |
| foundryup via curl                    | Same (stable)                  | N/A                    | Official install method unchanged    |

## Open Questions

1. **OWASP ZAP Size vs. Value**
   - What we know: ZAP is ~500MB installed and requires Java. It's a web app scanner, less directly relevant to smart contract dev.
   - What's unclear: Is the user sure they want ZAP in a smart contract dev container?
   - Recommendation: Include it but make it the last script (33_zap.sh) and add a config toggle to skip it.

2. **Mythril Reliability on Ubuntu 24.04**
   - What we know: Mythril requires Python 3.7-3.10 per README, but Ubuntu 24.04 ships Python 3.12. Mythril may or may not support 3.12.
   - What's unclear: Whether the latest mythril version has been updated for Python 3.12+
   - Recommendation: Use pipx with a fallback — if installation fails, log warning and continue. Mythril is notoriously fragile to install.

3. **Claude Code and OpenCode Authentication**
   - What we know: Both tools require authentication/API keys after installation
   - What's unclear: How to handle initial auth setup in automated provisioning
   - Recommendation: Install the binaries, but leave auth configuration to the user post-deploy. Add instructions to post-deploy output.

4. **Auto-VMID Selection**
   - What we know: User specified vmid in template.yaml, but it could conflict with existing containers
   - What's unclear: Whether to auto-detect next available VMID or just fail on conflict
   - Recommendation: Default to template.yaml value, but add `--vmid` CLI override and `pvesh get /cluster/nextid` for auto-assignment.

## Sources

### Primary (HIGH confidence)

- [Proxmox pct man page](https://pve.proxmox.com/pve-docs/pct.1.html) — PVE 9.1.2, Dec 2025 — Container lifecycle commands
- [mikefarah/yq README](https://github.com/mikefarah/yq) — v4.x — Installation, usage patterns, syntax
- [Slither README](https://github.com/crytic/slither) — Installation (pip/uv), Python 3.10+ requirement
- [Echidna README](https://github.com/crytic/echidna) — Installation, binary downloads, slither dependency
- [Aderyn README](https://github.com/Cyfrin/aderyn) — Installation via curl installer or npm
- [Mythril README](https://github.com/ConsenSys/mythril) — pip install, Docker, Python version requirements
- [solc-select README](https://github.com/crytic/solc-select) — pip install, usage
- [Trivy README](https://github.com/aquasecurity/trivy) — Binary download, brew install
- [Gitleaks README](https://github.com/gitleaks/gitleaks) — Binary download, installation methods
- [Semgrep README](https://github.com/semgrep/semgrep) — pip install, brew, docker
- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code/overview) — curl installer for Linux
- Existing codebase: `infra/lxc/templates/web3-dev/` — Proven patterns for Foundry, OpenCode install in LXC

### Secondary (MEDIUM confidence)

- OWASP ZAP installation — Based on known patterns; direct docs fetch failed but standard approach is well-documented
- Mythril Python 3.12 compatibility — Not explicitly confirmed in README

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — All tools verified via official READMEs and existing codebase patterns
- Architecture: HIGH — User specified design in detail; patterns follow established bash best practices
- Pitfalls: HIGH — Several pitfalls directly observed in existing codebase (see infra/lxc/ scripts)
- Tool installations: MEDIUM — Mythril/ZAP compatibility on Ubuntu 24.04 LXC needs runtime validation

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30 days — tools are stable, installation methods rarely change)

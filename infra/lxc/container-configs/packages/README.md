# Package Management

This directory contains declarative package list files that are automatically processed during container synchronization.

## File Naming Convention

Package files use the extension to indicate the target package manager:

| Extension | Package Manager   | Distributions                                           |
| --------- | ----------------- | ------------------------------------------------------- |
| `.apt`    | APT               | Debian, Ubuntu                                          |
| `.apk`    | APK               | Alpine Linux                                            |
| `.dnf`    | DNF/YUM           | Fedora, RHEL, CentOS, Rocky, AlmaLinux                  |
| `.npm`    | NPM (global)      | Cross-distribution (requires Node.js)                   |
| `.pip`    | PIP               | Cross-distribution (requires Python)                    |
| `.custom` | Custom installers | Cross-distribution (curl/wget-based, build-from-source) |

## File Format

Package files follow a simple format:

- **One package per line**
- **Comments** start with `#` (full-line or inline)
- **Blank lines** are ignored
- **Whitespace** is trimmed

### Example: `system.apt`

```bash
# Core system packages
curl
git
build-essential

# Docker
docker-ce

# Node.js with version pinning
nodejs=24.*
```

### Example: `development.dnf`

```bash
# Development tools
gcc
make
vim

# Version control
git
```

### Example: `global.npm`

```bash
# Global npm packages
typescript
prettier
eslint
```

## Processing Logic

1. **Detection**: The config-manager detects the container's OS and native package manager
2. **File Discovery**: Finds all `*.<pkg_manager>` files matching the detected manager
3. **Parsing**: Strips comments and blank lines from each file
4. **Check Installed**: Filters out packages that are already installed
5. **Batch Install**: Installs all missing packages from each file in a single batch operation
6. **Cross-Distro**: Processes `.npm` and `.pip` files on all distributions (if tools are available)
7. **Logging**: Reports installed/skipped/failed counts in the sync log

## Package Manager Operations

| Manager | Update Index     | Check Installed                       | Batch Install        |
| ------- | ---------------- | ------------------------------------- | -------------------- |
| **apt** | `apt-get update` | `dpkg-query -W -f='${Status}'`        | `apt-get install -y` |
| **apk** | `apk update`     | `apk info -e`                         | `apk add`            |
| **dnf** | `dnf makecache`  | `rpm -q`                              | `dnf install -y`     |
| **npm** | —                | `npm list -g --json` (fallback: tree) | `npm install -g`     |
| **pip** | —                | `pip show`                            | `pip install`        |

## Version Pinning Syntax

Different package managers support different version specification formats:

| Manager | Syntax                                   | Example            | Notes                             |
| ------- | ---------------------------------------- | ------------------ | --------------------------------- |
| **apt** | `package=version`                        | `nodejs=24.*`      | Supports glob patterns (`*`, `?`) |
| **apk** | `package=version`                        | `nodejs=24.0.0-r0` | Exact version with release suffix |
| **dnf** | `package-version`                        | `nodejs-24.0.0`    | Use dash separator (not equals)   |
| **npm** | `package@version`                        | `typescript@5.0.0` | Semver ranges supported           |
| **pip** | `package==version` or `package>=version` | `requests>=2.28.0` | PEP 440 version specifiers        |

**Note:** Invalid version syntax will be logged as a warning and the package may fail to install.

## Best Practices

- **Organize by category**: Use separate files for different package groups (e.g., `system.apt`, `development.apt`, `web3.apt`)
- **Version pinning**: Use version constraints where needed (e.g., `nodejs=24.*` for apt)
- **Idempotency**: The system automatically skips already-installed packages
- **Cross-distro awareness**: `.npm` and `.pip` files work on all distributions
- **Comments**: Document why packages are needed for future maintainers

## Integration with Other Phases

Package installation runs **after** file deployment and script execution, so:

- Scripts can prepare the environment (e.g., add package repositories)
- Files can configure package sources (e.g., `/etc/apt/sources.list.d/`)
- Installed packages are available for subsequent container usage

## Custom Package Installation

For tools that cannot be installed through standard package managers (e.g., Foundry, act, NVM), use `.custom` files with pipe-delimited format.

### Format

```bash
# Format: name|check_command|install_command[|timeout_seconds]
#
# Fields:
#   - name:            Human-readable tool name
#   - check_command:   Command that returns 0 if already installed
#   - install_command: Command to run for installation
#   - timeout_seconds: (Optional) Timeout in seconds (default: 300)

# Example: Foundry with 10-minute timeout
foundry|command -v forge|curl -L https://foundry.paradigm.xyz | bash && foundryup|600

# Example: GitHub CLI (no custom timeout, uses default 300s)
gh-cli|command -v gh|curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | ...
```

### Example Files

**`web3.custom`:**

```bash
# Web3 development tools
foundry|command -v forge|curl -L https://foundry.paradigm.xyz | bash && foundryup|600
```

**`cli.custom`:**

```bash
# CLI tools
act|command -v act|curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | bash
```

**`node.custom`:**

```bash
# Node.js ecosystem
nvm|[ -d "$HOME/.nvm" ]|curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash|240
pnpm|command -v pnpm|npm install -g pnpm
```

### Processing Logic

1. **Parse Format**: Reads each line, splits by pipe delimiter (`|`)
2. **Validate Fields**: Ensures name, check command, and install command are present
3. **Check Installed**: Runs check command — if exit code 0, skips (already installed)
4. **Install with Timeout**: Executes install command with timeout enforcement
5. **Verify**: Runs check command again to confirm successful installation
6. **Continue on Failure**: Failed installs don't block remaining tools

### Security Considerations

**✓ Safe Practices:**

- Scripts come from trusted git repository (version controlled)
- All commands are logged before execution for auditability
- Timeouts prevent hanging installations (both install and check commands)
- Failed installations don't abort entire sync
- Basic command safety validation detects obviously malicious patterns

**⚠️ Important Notes:**

- **CRITICAL**: Treat `.custom` files as executable code — review them carefully in PRs
- Only add install commands from **trusted sources** (official documentation, verified install scripts)
- Review curl/wget URLs carefully — ensure they point to official repositories
- Use HTTPS URLs when possible for security
- Test custom installations in a safe environment first
- Some tools may require shell restart or sourcing profile files (e.g., `source ~/.bashrc`)
- Commands are executed with `bash -c` — ensure proper quoting and escaping

**🔒 Code Review Checklist for `.custom` Files:**

When reviewing PRs that add or modify `.custom` files:

1. Verify URLs point to official, trusted sources
2. Check for suspicious patterns (e.g., unexpected `rm -rf`, strange redirects)
3. Ensure HTTPS is used for downloads
4. Validate timeout values are reasonable (30s minimum recommended)
5. Test installations in an isolated environment if possible

### Timeout Configuration

Default timeout is **5 minutes (300 seconds)** per tool. Adjust for:

- **Short timeouts (30-120s)**: Small downloads, npm global installs
- **Medium timeouts (300-600s)**: Curl-based installers, GitHub releases
- **Long timeouts (600-900s)**: Build-from-source, large downloads (Foundry, Rust toolchains)

**Note:** Minimum recommended timeout is 30 seconds. Lower values will generate warnings.

Example:

```bash
# Quick npm install (30 seconds)
pnpm|command -v pnpm|npm install -g pnpm|30

# Foundry install (10 minutes)
foundry|command -v forge|curl -L https://foundry.paradigm.xyz | bash && foundryup|600
```

### Special Characters and Escaping

**Pipe Character Limitation:**

The pipe character (`|`) is used as the field delimiter and **cannot** appear in your commands. If your install command requires literal pipe characters for shell piping, you have two options:

1. **Recommended**: Create a helper script and call it from the .custom file
2. **Alternative**: Chain commands using `&&` instead of pipes where possible

**Example:**

Instead of:

```bash
# This won't work - pipe inside install command
tool|command -v tool|curl -L https://example.com/install.sh | bash
```

Use:

```bash
# Option 1: Commands already use pipe correctly (pipe is between fields, not inside)
tool|command -v tool|curl -L https://example.com/install.sh | bash

# Option 2: Create a helper script
# In files/install-tool.sh:
#!/bin/bash
curl -L https://example.com/data.tar.gz | tar xz && mv tool /usr/local/bin/

# In .custom file:
tool|command -v tool|/path/to/install-tool.sh
```

## Troubleshooting

- **No packages installed**: Check the sync log at `/var/log/config-manager/sync.log`
- **Failed installations**: Review error messages in the log — common issues include network problems or missing repositories
- **Cross-distro packages skipped**: Ensure npm/pip are installed (add them to native package files first)
- **Custom install timeout**: Increase timeout value (4th field) if installation legitimately takes longer
- **Custom install verification failed**: Tool may require shell restart, manual PATH update, or additional configuration
- **Custom install syntax error**: Ensure exactly 3 or 4 fields separated by single pipe (`|`) characters

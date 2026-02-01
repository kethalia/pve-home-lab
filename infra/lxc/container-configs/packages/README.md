# Package Management

This directory contains declarative package list files that are automatically processed during container synchronization.

## File Naming Convention

Package files use the extension to indicate the target package manager:

| Extension | Package Manager | Distributions |
|-----------|----------------|---------------|
| `.apt` | APT | Debian, Ubuntu |
| `.apk` | APK | Alpine Linux |
| `.dnf` | DNF/YUM | Fedora, RHEL, CentOS, Rocky, AlmaLinux |
| `.npm` | NPM (global) | Cross-distribution (requires Node.js) |
| `.pip` | PIP | Cross-distribution (requires Python) |

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

| Manager | Update Index | Check Installed | Batch Install |
|---------|-------------|-----------------|---------------|
| **apt** | `apt-get update` | `dpkg -l \| grep` | `apt-get install -y` |
| **apk** | `apk update` | `apk info -e` | `apk add` |
| **dnf** | `dnf makecache` | `rpm -q` | `dnf install -y` |
| **npm** | — | `npm list -g` | `npm install -g` |
| **pip** | — | `pip show` | `pip install` |

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

## Troubleshooting

- **No packages installed**: Check the sync log at `/var/log/config-manager/sync.log`
- **Failed installations**: Review error messages in the log — common issues include network problems or missing repositories
- **Cross-distro packages skipped**: Ensure npm/pip are installed (add them to native package files first)

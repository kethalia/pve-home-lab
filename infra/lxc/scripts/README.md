# LXC Scripts and Configuration Management

This directory contains the configuration management system and supporting scripts for LXC containers.

## Directory Structure

```
infra/lxc/
├── scripts/
│   ├── README.md                    # This file
│   └── config-manager/              # Shared configuration management system
│       ├── install-config-manager.sh
│       ├── config-sync.sh
│       ├── config-rollback
│       └── ...
│
└── templates/                       # Self-contained container templates
    └── web3-dev/                    # Web3 development template
        ├── container.sh             # ProxmoxVE creation script
        ├── install.sh               # Container setup script
        ├── README.md                # Template documentation
        └── container-configs/       # Web3-specific configuration
            ├── packages/            # Docker, Node.js, Web3 tools
            ├── scripts/             # Boot-time scripts
            └── files/               # Config files
```

**Key Point:** Each template is **completely self-contained** with its own `container-configs/` directory. Templates are independent and portable - just copy the directory to create a new template.

## Configuration Management System

The `config-manager/` directory contains the git-based configuration management system used by all LXC templates.

### Components

- **`install-config-manager.sh`** - Installer script (called by templates)
- **`config-sync.sh`** - Main synchronization logic
- **`config-rollback`** - Rollback and snapshot management
- **`config-manager.service`** - Systemd service for auto-sync

### Features

- **Declarative Configuration:** All settings in version-controlled files
- **Auto-Sync on Boot:** Configuration applied every container start
- **Rollback Capable:** Snapshot system with conflict detection
- **Package Management:** Supports apt, custom installers, npm packages
- **File Management:** Template-based file deployment with policies
- **Boot Scripts:** Custom initialization scripts

### Documentation

See `config-manager/README.md` for detailed documentation on:

- Installation and usage
- Configuration structure
- Package management
- File management
- Rollback system

## Templates

Templates are complete, self-contained container setups located in `../templates/`.

### Available Templates

#### web3-dev

Web3 development environment with Docker-in-Docker support.

**Quick Start:**

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"
```

**Includes:**

- Docker CE with Docker Compose
- Node.js ecosystem (npm, pnpm)
- Web3 tools (Foundry, Solidity)
- CLI utilities (gh, act)

**Documentation:** `../templates/web3-dev/README.md`

### Creating Custom Templates

Templates are reusable, self-contained setups that can be customized:

1. **Copy existing template:**

   ```bash
   cp -r infra/lxc/templates/web3-dev infra/lxc/templates/my-template
   ```

2. **Customize components:**
   - `container.sh` - Container resources, tags, OS
   - `install.sh` - Base packages, user setup
   - `README.md` - Documentation for your template

3. **Customize the container-configs:**

   ```bash
   # Template already includes its own container-configs/
   cd infra/lxc/templates/my-template/container-configs/packages
   rm -f *.custom  # Remove web3 packages
   # Add your packages
   ```

4. **Update install.sh CONFIG_PATH (already points to template's own configs):**
   ```bash
   CONFIG_PATH="${CONFIG_PATH:-infra/lxc/templates/my-template/container-configs}"
   ```

### Template Best Practices

- **Self-contained:** Each template should include container.sh, install.sh, and README.md
- **Documented:** Clear README explaining use case and customization
- **Configurable:** Use environment variables for customization
- **Reusable:** Design for easy forking and modification

### Example: Creating a Python Template

```bash
# 1. Copy entire web3-dev template (includes container-configs/)
cp -r infra/lxc/templates/web3-dev infra/lxc/templates/python-dev

# 2. Edit container.sh
cd infra/lxc/templates/python-dev
sed -i 's/Web3 Dev Container/Python Dev Container/' container.sh
sed -i 's/web3;development;nodejs;docker/python;development;django;flask/' container.sh

# 3. Edit install.sh CONFIG_PATH (update to point to this template)
sed -i 's|web3-dev/container-configs|python-dev/container-configs|' install.sh

# 4. Replace packages in container-configs/
cd container-configs/packages
rm -f cli.custom node.custom web3.custom
echo "python3 python3-pip python3-venv" > python.apt
echo "django flask fastapi uvicorn" > python.pip

# 5. Update README.md with Python-specific documentation
cd ../..
vim README.md  # Document Python template

# Done! Completely independent template
```

## Container Configs Structure

Each template includes its own `container-configs/` directory with template-specific packages and configuration.

### Standard Structure

```
templates/<template-name>/container-configs/
├── packages/
│   ├── *.apt         # APT packages (one per line)
│   ├── *.custom      # Custom installer scripts
│   ├── *.npm         # NPM global packages
│   └── *.pip         # Python pip packages
├── scripts/
│   └── *.sh          # Boot-time scripts (run alphabetically)
└── files/
    ├── *.template    # File templates (with variable substitution)
    └── *.policy      # Deployment policies (deploy-once, always-update, etc.)
```

### Template Examples

Each template is completely self-contained:

- `templates/web3-dev/container-configs/` - Docker, Node.js, Web3 tools
- `templates/python-dev/container-configs/` - Python, Django, Flask
- `templates/datascience/container-configs/` - Jupyter, Pandas, TensorFlow
- `templates/minimal/container-configs/` - Basic system only

All follow the same structure but with different packages.

## Usage Examples

### Deploy Web3 Development Container

```bash
# Default configuration
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"

# Custom resources
var_cpu=2 var_ram=4096 var_disk=30 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"
```

### Using Custom Repository

```bash
# Point to your fork
REPO_URL="https://github.com/myuser/my-fork.git" \
REPO_BRANCH="develop" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/kethalia/infrahaus/main/infra/lxc/templates/web3-dev/container.sh)"
```

### Container Management

```bash
# List containers
pct list

# Enter container console
pct enter <container-id>

# Inside container - check config status
config-rollback status

# Inside container - trigger manual sync
sudo systemctl restart config-manager

# Inside container - view sync logs
journalctl -u config-manager -f
```

## Related Documentation

- **Templates:** `../templates/<template-name>/README.md`
- **Config Manager:** `config-manager/README.md`
- **Container Configs:** `../container-configs/README.md`
- **ProxmoxVE Pattern:** [community-scripts/ProxmoxVE](https://github.com/community-scripts/ProxmoxVE)

## Contributing

### Reporting Issues

Report issues at: https://github.com/kethalia/infrahaus/issues

### Contributing Templates

1. Create new template in `../templates/your-template/`
2. Include container.sh, install.sh, and README.md
3. Create custom configs in `../container-configs-your-template/`
4. Submit PR with comprehensive documentation

### Contributing to Config Manager

The config-manager system is designed to be generic and reusable. Improvements should:

- Maintain backward compatibility
- Follow existing patterns
- Include tests and documentation

## License

MIT - See [LICENSE](https://github.com/kethalia/infrahaus/blob/main/LICENSE)

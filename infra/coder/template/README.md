# Web3 Full-Stack Development - Coder Template

A production-ready Coder template for modern Web3 and full-stack development. Features Docker, Node.js, Foundry, and comprehensive tooling - all auto-configured and optimized for fast startup.

## Features

### Development Environment
- **Docker** - Full Docker + Compose + act (run GitHub Actions locally)
- **Node.js** - Multiple versions (18, 20, 22, 24) with PNPM
- **Foundry** - Complete Ethereum development toolkit (forge, cast, anvil, chisel)
- **Git** - Latest version with productivity aliases
- **ZSH** - Oh My Zsh with Powerlevel10k and plugins

### VS Code Integration
- 20 curated extensions including:
  - Solidity (Hardhat + language support)
  - Docker client
  - Tailwind CSS, GraphQL, Prisma
  - GitLens, Error Lens, Prettier
  - Code spell checker & TODO highlights

### Performance & Reliability
- **Fast startup** - 30-60 seconds after first boot (3-5 min initial)
- **Resource limits** - Configurable memory and CPU
- **Health checks** - Automatic container health monitoring
- **Monitoring** - Built-in Docker and workspace metrics

## Quick Start

### Prerequisites
- Coder v2.x deployed and running
- Docker available on Coder host
- Coder CLI installed (optional but recommended)

### Installation

**Option 1: Using Coder CLI (Recommended)**

```bash
# Push to your Coder instance
coder templates push web3-dev-workspace
```

**Option 2: Using Coder UI**

1. In Coder UI: Templates > Create Template
2. Upload this directory or connect the git repository
3. Configure metadata:
   - Name: `web3-dev-workspace`
   - Display Name: `Web3 Full-Stack Development`

### Create a Workspace

```bash
# Create workspace from template
coder create --template web3-dev-workspace my-workspace

# SSH into workspace
coder ssh my-workspace

# Verify everything works
docker ps
node --version
forge --version
```

## What's Included

### Core Technologies

| Tool | Version | Purpose |
|------|---------|---------|
| Docker | Latest | Container runtime + Compose |
| Node.js | 18, 20, 22, 24 | JavaScript runtime |
| PNPM | Latest | Fast package manager |
| Foundry | Latest | Ethereum development |
| Git | Latest | Version control |
| ZSH | Latest | Shell with Oh My Zsh |

### Shell Aliases

**Git**
```bash
gs          # git status
gco         # git checkout
gc          # git commit
gp          # git pull
git lg      # pretty log graph
```

**General**
```bash
d           # docker
dc          # docker-compose
g           # git
ll          # ls -lah
k           # kubectl
```

## Resource Configuration

Default settings (all configurable in `main.tf` or via Coder UI parameters):

```hcl
# Memory limit
workspace_memory_gb = 8     # 8GB RAM (16GB swap)

# CPU limit
workspace_cpus = 4          # 4 CPU cores

# Optional dotfiles
dotfiles_uri = ""           # Your dotfiles repo URL
```

## Template Structure

```
template/
├── Dockerfile              # Container image definition
├── main.tf                 # Terraform configuration
└── README.md               # This file
```

## Configuration

### Adding VS Code Extensions

Edit the `code-server` module in `main.tf`:

```hcl
extensions = [
  # ... existing extensions ...
  "publisher.extension-name",
  "another.extension",
]
```

### Modifying the Base Image

Edit `Dockerfile` to add packages:

```dockerfile
RUN apt-get update && apt-get install -y \
    your-package-here \
    another-package \
    && rm -rf /var/lib/apt/lists/*
```

### Adding Dotfiles Support

Add your dotfiles repository URL when creating the workspace. Your dotfiles repo should include an `install.sh` script.

## Security Considerations

### Docker Socket Access

This template mounts the Docker socket (`/var/run/docker.sock`) which provides full Docker functionality with native performance, but also means users can access the host Docker daemon.

Recommendations:
- Use in trusted development environments
- Implement network isolation if needed
- Consider Docker authorization plugins
- Use for development, not production workloads

## Troubleshooting

### Docker not accessible
```bash
ls -l /var/run/docker.sock
groups | grep docker
docker info
```

### Tools not installing
```bash
# Check network connectivity
curl -I https://github.com

# View script logs in Coder UI
# Templates > Your Template > Logs
```

### Out of memory/CPU
Adjust resource limits in `main.tf` and update the template:
```bash
coder templates push web3-dev-workspace
```

## External Resources
- [Coder Documentation](https://coder.com/docs)
- [Terraform Coder Provider](https://registry.terraform.io/providers/coder/coder/latest/docs)
- [Docker Documentation](https://docs.docker.com)
- [Foundry Book](https://book.getfoundry.sh)
- [act Documentation](https://github.com/nektos/act)

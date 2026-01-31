# PVE Home Lab

A self-hosted home lab built on [Proxmox VE](https://www.proxmox.com/en/proxmox-virtual-environment/overview), running Docker-based services across AI/ML, media, gaming, blockchain, and development workloads. Everything is defined as code and documented with a [Fumadocs](https://fumadocs.vercel.app/) site.

## Monorepo Structure

```
pve-home-lab/
├── apps/
│   └── web/                 # Documentation site (Next.js + Fumadocs)
├── infra/                   # Infrastructure configurations
│   ├── ai/                  # Ollama, Open WebUI, Kokoro TTS, ComfyUI
│   ├── coder/               # Coder cloud development workspaces
│   ├── docker/              # Docker installation guides
│   ├── dokploy/             # Dokploy self-hosted PaaS
│   ├── gaming/              # Sunshine + Steam cloud gaming
│   ├── jellyfin/            # Jellyfin media server + arr-stack
│   ├── lukso-node/          # LUKSO blockchain node (Geth + Lighthouse)
│   └── wireguard/           # WireGuard VPN + Nginx Proxy Manager
├── package.json             # Root workspace config
├── pnpm-workspace.yaml      # pnpm workspace definition
└── turbo.json               # Turborepo task pipeline
```

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 10+

### Development

```bash
# Clone the repository
git clone https://github.com/kethalia/pve-home-lab.git
cd pve-home-lab

# Install dependencies
pnpm install

# Start the docs site in development mode
pnpm dev
```

The documentation site will be available at `http://localhost:3000`.

### Build

```bash
pnpm build
```

## Services

| Service | Directory | Description |
|---|---|---|
| **AI Stack** | `infra/ai/` | Ollama (LLM inference), Open WebUI (chat), Kokoro (TTS), ComfyUI (image generation) — all GPU-accelerated |
| **Development** | `infra/coder/` | Coder cloud workspaces with Terraform templates, Node.js, Docker, Foundry, and 20 VS Code extensions |
| **Deployment** | `infra/dokploy/` | Dokploy self-hosted PaaS with Docker Swarm, Traefik, Postgres, and Redis |
| **Media** | `infra/jellyfin/` | Jellyfin media server with Gluetun VPN, qBittorrent, Radarr, Sonarr, Prowlarr, and Bazarr |
| **Gaming** | `infra/gaming/` | Sunshine + Steam cloud gaming with NVIDIA GPU passthrough, streamed via Moonlight |
| **Blockchain** | `infra/lukso-node/` | LUKSO full node running Geth + Lighthouse with Prometheus and Grafana monitoring |
| **Networking** | `infra/wireguard/` | WireGuard VPN tunnel to a public VPS with Nginx Proxy Manager for reverse proxying |

## Tech Stack

- **Hypervisor**: Proxmox VE
- **Containers**: Docker + Docker Compose
- **GPU**: NVIDIA (CUDA) for AI, media transcoding, and gaming
- **IaC**: Terraform (Coder templates), Docker Compose (all services)
- **Docs**: Next.js 15, Fumadocs, Tailwind CSS, Turborepo
- **Networking**: WireGuard, Nginx Proxy Manager, Traefik

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run `pnpm build` to verify the docs site builds cleanly
5. Commit and push
6. Open a pull request

## License

This project is open source. See individual service directories for specific licenses.

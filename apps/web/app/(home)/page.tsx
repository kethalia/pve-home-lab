import Link from "next/link";

const features = [
  {
    title: "Container Templates",
    description:
      "One-command customizable LXC containers for Proxmox with git-based config management.",
    href: "/docs/container-templates",
    icon: "[]",
  },
  {
    title: "Getting Started",
    description:
      "Hardware recommendations, Proxmox VE setup, Docker installation, and network topology.",
    href: "/docs/getting-started",
    icon: "~",
  },
  {
    title: "AI Stack",
    description:
      "Ollama for LLM inference, Open WebUI for chat, Kokoro TTS, and ComfyUI for image generation.",
    href: "/docs/ai",
    icon: "%",
  },
  {
    title: "Development",
    description:
      "Coder cloud workspaces with Node.js, Docker, Foundry, and 19 VS Code extensions.",
    href: "/docs/development",
    icon: ">_",
  },
  {
    title: "Deployment",
    description:
      "Dokploy self-hosted PaaS with Docker Swarm, Traefik reverse proxy, and automatic TLS.",
    href: "/docs/deployment",
    icon: "^",
  },
  {
    title: "Media Server",
    description:
      "Jellyfin with VPN-routed automated downloading via Radarr, Sonarr, and Prowlarr.",
    href: "/docs/media",
    icon: "#",
  },
  {
    title: "Cloud Gaming",
    description:
      "Sunshine + Steam game streaming with NVIDIA GPU passthrough and Moonlight clients.",
    href: "/docs/gaming",
    icon: "*",
  },
  {
    title: "Blockchain",
    description:
      "LUKSO full node running Geth + Lighthouse with Prometheus and Grafana monitoring.",
    href: "/docs/blockchain",
    icon: "$",
  },
  {
    title: "Networking",
    description:
      "WireGuard VPN tunnel to a public VPS with Nginx Proxy Manager for reverse proxying.",
    href: "/docs/networking",
    icon: "&",
  },
];

const techStack = [
  "Proxmox VE",
  "Docker",
  "NVIDIA CUDA",
  "Terraform",
  "WireGuard",
  "Next.js",
  "Tailwind CSS",
  "Turborepo",
];

export default function HomePage() {
  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center px-6 pt-20 pb-16 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-secondary/50 px-4 py-1.5 text-sm text-fd-muted-foreground">
          Self-hosted infrastructure as code
        </div>
        <h1 className="mb-6 max-w-3xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          PVE Home Lab
        </h1>
        <p className="mb-10 max-w-2xl text-lg text-fd-muted-foreground leading-relaxed">
          A Proxmox VE home lab running Docker-based services across AI/ML,
          media, gaming, blockchain, and development workloads. Everything
          defined as code, documented here.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/docs/getting-started"
            className="rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
          >
            Get Started
          </Link>
          <Link
            href="/docs"
            className="rounded-lg border border-fd-border bg-fd-background px-6 py-3 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
          >
            Browse Docs
          </Link>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">
          What&apos;s inside
        </h2>
        <p className="mb-12 text-center text-fd-muted-foreground">
          Nine service categories, each fully documented with setup guides,
          configs, and best practices.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Link
              key={feature.href}
              href={feature.href}
              className="group flex flex-col rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:border-fd-primary/50 hover:bg-fd-accent/50"
            >
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-fd-accent font-mono text-sm font-bold text-fd-accent-foreground">
                {feature.icon}
              </span>
              <h3 className="mb-1.5 text-sm font-semibold text-fd-card-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-fd-muted-foreground">
                {feature.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="mx-auto w-full max-w-4xl px-6 py-16">
        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">
          Architecture
        </h2>
        <p className="mb-8 text-center text-fd-muted-foreground">
          One physical server, multiple isolated workloads.
        </p>
        <div className="overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-6">
          <pre className="text-xs leading-relaxed text-fd-muted-foreground sm:text-sm">
            {`Proxmox VE Host
├── VM: AI / ML workloads (GPU passthrough)
│   ├── Ollama         ── LLM inference
│   ├── Open WebUI     ── Chat interface
│   ├── Kokoro         ── Text-to-speech
│   └── ComfyUI        ── Image generation
├── VM: Media Server (GPU transcoding)
│   ├── Jellyfin       ── Media player
│   ├── Gluetun        ── VPN gateway
│   ├── qBittorrent    ── Downloads
│   └── Radarr / Sonarr / Prowlarr / Bazarr
├── VM: Gaming (GPU passthrough)
│   └── Sunshine + Steam
├── VM: Blockchain
│   ├── Geth           ── Execution client
│   ├── Lighthouse     ── Consensus client
│   └── Prometheus + Grafana
├── LXC: Deployment
│   └── Dokploy        ── PaaS with Traefik
├── LXC: Development
│   └── Coder          ── Cloud workspaces
└── VPS: Public Proxy
    ├── WireGuard      ── VPN tunnel
    └── Nginx Proxy Manager`}
          </pre>
        </div>
      </section>

      {/* Tech stack */}
      <section className="mx-auto w-full max-w-4xl px-6 py-16">
        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">
          Built with
        </h2>
        <p className="mb-8 text-center text-fd-muted-foreground">
          Core technologies powering the lab and this documentation site.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {techStack.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-fd-border bg-fd-secondary/50 px-4 py-1.5 text-sm text-fd-muted-foreground"
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-fd-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-fd-muted-foreground">
            PVE Home Lab &mdash; Self-hosted infrastructure as code
          </p>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/kethalia/pve-home-lab"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
            >
              GitHub
            </a>
            <Link
              href="/docs"
              className="text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
            >
              Documentation
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

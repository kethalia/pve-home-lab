import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="mb-4 text-4xl font-bold">PVE Home Lab</h1>
      <p className="mb-8 max-w-lg text-fd-muted-foreground">
        Infrastructure documentation for a Proxmox VE home lab running AI,
        media, gaming, blockchain, and development services.
      </p>
      <Link
        href="/docs"
        className="rounded-lg bg-fd-primary px-6 py-3 text-fd-primary-foreground font-medium transition-colors hover:bg-fd-primary/90"
      >
        Browse Docs
      </Link>
    </main>
  );
}

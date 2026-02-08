import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js middleware for route protection.
 *
 * Runs in Edge Runtime — no Node.js-only APIs (no Redis, no fs, etc.).
 *
 * Auth mode: env-var based (PVE_HOST + PVE_ROOT_PASSWORD).
 * All routes are accessible without login when env vars are configured.
 * /login is kept for future multi-user auth but redirects to dashboard.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect /login to dashboard — no login needed with env-var auth.
  // Login page will be re-enabled when multi-user DB credentials are added.
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

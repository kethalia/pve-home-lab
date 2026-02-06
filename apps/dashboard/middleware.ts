import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js middleware for route protection.
 *
 * Runs in Edge Runtime — no Node.js-only APIs (no Redis, no fs, etc.).
 * Performs a lightweight cookie-existence check for the iron-session cookie.
 * Full session validation (Redis lookup, expiry) happens server-side in routes.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that don't require authentication
  const publicPaths = ["/login"];
  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // Check for iron-session cookie (lightweight Edge-compatible check)
  const sessionCookie = request.cookies.get("lxc-session");
  const hasSession = !!sessionCookie?.value;

  // Authenticated user visiting /login → redirect to dashboard
  if (isPublicPath && hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Public path without session → allow through
  if (isPublicPath) {
    return NextResponse.next();
  }

  // Protected path without session → redirect to /login
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated user on protected path → allow through
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

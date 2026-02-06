import "server-only";

import {
  getIronSession,
  type SessionOptions,
  type IronSession,
} from "iron-session";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getRedis } from "@/lib/redis";
import type { ProxmoxTicketCredentials } from "@/lib/proxmox/types";

// ============================================================================
// Session Types
// ============================================================================

/**
 * Data stored in the iron-session cookie.
 * Only contains a session ID — actual session data lives in Redis.
 */
export interface SessionData {
  sessionId?: string;
}

/**
 * Full session data stored in Redis.
 * Contains the Proxmox ticket, CSRF token, and user info.
 */
export interface RedisSessionData {
  ticket: string;
  csrfToken: string;
  username: string;
  realm: string;
  expiresAt: string; // ISO date string
}

// ============================================================================
// Session Configuration
// ============================================================================

function getSessionOptions(): SessionOptions {
  const secret = process.env.SESSION_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET environment variable is required in production. Must be at least 32 characters.",
    );
  }

  return {
    cookieName: "lxc-session",
    password: secret || "development-secret-must-be-at-least-32-chars!",
    cookieOptions: {
      httpOnly: true,
      sameSite: "strict" as const,
      secure: process.env.NODE_ENV === "production",
    },
  };
}

/** Redis key prefix for sessions */
const SESSION_PREFIX = "session:";

/** Session TTL in seconds (2 hours) */
const SESSION_TTL = 7200;

// ============================================================================
// Session Operations
// ============================================================================

/**
 * Get the iron-session from cookies.
 * Returns the session object with save/destroy methods.
 */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}

/**
 * Get the full session data from Redis.
 * Reads the session ID from the iron-session cookie, then fetches
 * the actual session data from Redis.
 *
 * @returns The session data if valid and not expired, null otherwise.
 */
export async function getSessionData(): Promise<RedisSessionData | null> {
  const session = await getSession();

  if (!session.sessionId) {
    return null;
  }

  const redis = getRedis();
  const raw = await redis.get(`${SESSION_PREFIX}${session.sessionId}`);

  if (!raw) {
    // Redis session gone but cookie still exists — clean up cookie
    session.destroy();
    return null;
  }

  try {
    const data = JSON.parse(raw) as RedisSessionData;

    // Validate not expired
    const expiresAt = new Date(data.expiresAt);
    if (expiresAt <= new Date()) {
      // Session expired — clean up both Redis and cookie
      await redis.del(`${SESSION_PREFIX}${session.sessionId}`);
      session.destroy();
      return null;
    }

    return data;
  } catch {
    // Invalid JSON in Redis — clean up both Redis and cookie
    await redis.del(`${SESSION_PREFIX}${session.sessionId}`);
    session.destroy();
    return null;
  }
}

/**
 * Create a new session.
 * Generates a random session ID, stores session data in Redis with TTL,
 * and sets the session ID in the iron-session cookie.
 */
export async function createSession(data: {
  ticket: string;
  csrfToken: string;
  username: string;
  realm: string;
  expiresAt: string;
}): Promise<void> {
  const sessionId = crypto.randomUUID();
  const redis = getRedis();

  // Store session data in Redis with TTL
  const sessionData: RedisSessionData = {
    ticket: data.ticket,
    csrfToken: data.csrfToken,
    username: data.username,
    realm: data.realm,
    expiresAt: data.expiresAt,
  };

  await redis.setex(
    `${SESSION_PREFIX}${sessionId}`,
    SESSION_TTL,
    JSON.stringify(sessionData),
  );

  // Set session ID in iron-session cookie
  const session = await getSession();
  session.sessionId = sessionId;
  await session.save();
}

/**
 * Destroy the current session.
 * Removes the session data from Redis and destroys the iron-session cookie.
 */
export async function destroySession(): Promise<void> {
  const session = await getSession();

  if (session.sessionId) {
    const redis = getRedis();
    await redis.del(`${SESSION_PREFIX}${session.sessionId}`);
  }

  session.destroy();
}

/**
 * Get Proxmox credentials from the current session.
 * Convenience helper for API calls that need the ticket and CSRF token.
 *
 * @returns ProxmoxTicketCredentials if session is valid, null otherwise.
 */
export async function getProxmoxCredentials(): Promise<ProxmoxTicketCredentials | null> {
  const sessionData = await getSessionData();

  if (!sessionData) {
    return null;
  }

  return {
    type: "ticket",
    ticket: sessionData.ticket,
    csrfToken: sessionData.csrfToken,
    username: sessionData.username,
    expiresAt: new Date(sessionData.expiresAt),
  };
}

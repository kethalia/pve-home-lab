import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action";
import { getSessionData, type RedisSessionData } from "@/lib/session";

/**
 * Error class for user-facing action errors.
 * Throw this inside server actions to surface a specific message to the client
 * instead of the generic "Something went wrong" default.
 *
 * Usage: throw new ActionError("VMID 600 is already in use. Pick a different ID.");
 */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

/**
 * Classify errors for safe client responses.
 * Network/TLS errors → "Unable to reach Proxmox server"
 * Everything else → generic message (don't leak internals)
 */
function isNetworkError(error: Error): boolean {
  const msg = (
    error.message +
    (error.cause instanceof Error ? " " + error.cause.message : "")
  ).toLowerCase();

  return (
    msg.includes("fetch") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("ehostunreach") ||
    msg.includes("cert") ||
    msg.includes("certificate") ||
    msg.includes("self-signed") ||
    msg.includes("ssl") ||
    msg.includes("unable to verify")
  );
}

/**
 * Base action client — no auth required.
 * Use for: login, public health checks.
 */
export const actionClient = createSafeActionClient({
  handleServerError(error) {
    // ActionError: intentionally user-facing, pass message through
    if (error instanceof ActionError) {
      return error.message;
    }

    if (error instanceof Error && isNetworkError(error)) {
      return "Unable to reach Proxmox server";
    }

    // Log unexpected errors server-side for debugging
    console.error("[safe-action] Unhandled server error:", error);

    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
});

/**
 * Authenticated action client — requires valid session.
 * Use for: all protected actions (template CRUD, container ops, settings).
 *
 * Injects `session` into the action context so every authenticated action
 * gets typed access to the current user's session data.
 */
export const authActionClient = actionClient.use(async ({ next }) => {
  const session = await getSessionData();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return next({ ctx: { session } });
});

/**
 * Type helper for the auth context injected by authActionClient.
 */
export type AuthContext = {
  session: RedisSessionData;
};

import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action";

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
 * Authenticated action client — verifies Proxmox env vars are configured.
 * Use for: all protected actions (template CRUD, container ops, settings).
 *
 * Auth is provided by PVE_HOST + PVE_ROOT_PASSWORD env vars.
 * This middleware just validates the server is properly configured.
 * Will be replaced with real multi-user auth when DB-stored credentials are added.
 */
export const authActionClient = actionClient.use(async ({ next }) => {
  if (!process.env.PVE_HOST || !process.env.PVE_ROOT_PASSWORD) {
    throw new Error(
      "Server not configured: PVE_HOST and PVE_ROOT_PASSWORD environment variables are required.",
    );
  }

  return next({ ctx: {} });
});

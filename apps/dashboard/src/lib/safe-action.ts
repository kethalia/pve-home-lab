import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action";
import { getSessionData, type RedisSessionData } from "@/lib/session";

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
    if (error instanceof Error && isNetworkError(error)) {
      return "Unable to reach Proxmox server";
    }

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

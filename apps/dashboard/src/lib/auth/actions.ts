"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { login } from "@/lib/proxmox/auth";
import { createSession, destroySession } from "@/lib/session";

// ============================================================================
// Action State Types
// ============================================================================

export interface ActionState {
  success: boolean;
  error?: string;
}

// ============================================================================
// Validation Schema
// ============================================================================

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  realm: z.enum(["pam", "pve"], {
    message: "Realm must be 'pam' or 'pve'",
  }),
});

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Login server action.
 * Validates input, authenticates against Proxmox VE, and creates a session.
 *
 * Compatible with React 19 useActionState pattern.
 */
export async function loginAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Extract form data
  const raw = {
    username: formData.get("username"),
    password: formData.get("password"),
    realm: formData.get("realm"),
  };

  // Validate input
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
    return { success: false, error: firstError };
  }

  const { username, password, realm } = parsed.data;

  try {
    // Authenticate against Proxmox VE
    const host = process.env.PVE_HOST || process.env.PROXMOX_HOST;
    const port = parseInt(
      process.env.PVE_PORT || process.env.PROXMOX_PORT || "8006",
      10,
    );

    if (!host) {
      return { success: false, error: "Proxmox server is not configured" };
    }

    const credentials = await login(host, port, username, password, realm);

    // Create session with ticket data
    await createSession({
      ticket: credentials.ticket,
      csrfToken: credentials.csrfToken,
      username: credentials.username,
      realm,
      expiresAt: credentials.expiresAt.toISOString(),
    });

    return { success: true };
  } catch (error) {
    console.error("[loginAction] Auth error:", error);

    // Don't leak Proxmox error details to the client
    if (error instanceof Error) {
      const msg = error.message;
      if (
        msg.includes("fetch") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ENOTFOUND") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("CERT") ||
        msg.includes("certificate") ||
        msg.includes("self-signed") ||
        msg.includes("SSL") ||
        msg.includes("unable to verify")
      ) {
        return { success: false, error: "Unable to reach Proxmox server" };
      }
    }

    return { success: false, error: "Invalid credentials" };
  }
}

/**
 * Logout server action.
 * Destroys the session and redirects to the login page.
 */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

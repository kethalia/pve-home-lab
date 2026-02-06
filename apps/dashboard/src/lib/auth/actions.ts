"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { login } from "@/lib/proxmox/auth";
import { createSession, destroySession } from "@/lib/session";
import { actionClient, authActionClient } from "@/lib/safe-action";

// ============================================================================
// Schemas
// ============================================================================

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  realm: z.enum(["pam", "pve"], {
    message: "Realm must be 'pam' or 'pve'",
  }),
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Login action — no auth required (public).
 * Validates input, authenticates against Proxmox VE, creates session.
 */
export const loginAction = actionClient
  .schema(loginSchema)
  .action(async ({ parsedInput: { username, password, realm } }) => {
    const host = process.env.PVE_HOST || process.env.PROXMOX_HOST;
    const port = parseInt(
      process.env.PVE_PORT || process.env.PROXMOX_PORT || "8006",
      10,
    );

    if (!host) {
      throw new Error("Proxmox server is not configured");
    }

    const credentials = await login(host, port, username, password, realm);

    await createSession({
      ticket: credentials.ticket,
      csrfToken: credentials.csrfToken,
      username: credentials.username,
      realm,
      expiresAt: credentials.expiresAt.toISOString(),
    });

    return { success: true as const };
  });

/**
 * Logout action — requires auth.
 * Destroys session and redirects to login.
 */
export const logoutAction = authActionClient.action(async () => {
  await destroySession();
  redirect("/login");
});

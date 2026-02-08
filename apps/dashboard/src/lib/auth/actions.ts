"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
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
 * Login action — no-op with env-var auth.
 * Kept for API compatibility; middleware redirects /login to dashboard.
 * Will be re-implemented when multi-user DB credentials are added.
 */
export const loginAction = actionClient.schema(loginSchema).action(async () => {
  return { success: true as const };
});

/**
 * Logout action — no-op with env-var auth (no session to destroy).
 * Redirects to dashboard since there's nothing to log out of.
 * Will be re-implemented when multi-user DB credentials are added.
 */
export const logoutAction = authActionClient.action(async () => {
  redirect("/");
});

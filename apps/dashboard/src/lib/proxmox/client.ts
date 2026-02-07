/**
 * Core Proxmox VE HTTP client
 */

// Server-side module — do not import from client components
import { fetch as undiciFetch, Agent as UndiciAgent } from "undici";
import type { ZodType } from "zod";
import { ProxmoxApiError, ProxmoxAuthError, ProxmoxError } from "./errors";
import type {
  ProxmoxApiResponse,
  ProxmoxClientConfig,
  ProxmoxCredentials,
} from "./types";

export class ProxmoxClient {
  private readonly baseUrl: string;
  private credentials: ProxmoxCredentials;
  private readonly dispatcher?: UndiciAgent;
  private readonly retryConfig: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
  };

  constructor(config: ProxmoxClientConfig) {
    const port = config.port ?? 8006;
    this.baseUrl = `https://${config.host}:${port}/api2/json`;
    this.credentials = config.credentials;

    // Handle self-signed SSL certificates
    if (config.verifySsl === false) {
      this.dispatcher = new UndiciAgent({
        connect: { rejectUnauthorized: false },
      });
    }

    this.retryConfig = {
      maxRetries: config.retryConfig?.maxRetries ?? 3,
      initialDelayMs: config.retryConfig?.initialDelayMs ?? 1000,
      maxDelayMs: config.retryConfig?.maxDelayMs ?? 10000,
    };
  }

  /**
   * Update credentials (e.g., after ticket refresh)
   */
  updateCredentials(credentials: ProxmoxCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Get current credentials
   */
  getCredentials(): ProxmoxCredentials {
    return this.credentials;
  }

  /**
   * Check if ticket is about to expire and needs refresh
   */
  needsTicketRefresh(): boolean {
    if (this.credentials.type === "ticket") {
      const now = new Date();
      const expiresAt = this.credentials.expiresAt;
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();
      // Refresh if less than 10 minutes remaining
      return timeUntilExpiry < 10 * 60 * 1000;
    }
    return false;
  }

  /**
   * Build auth headers based on credential type
   */
  private getAuthHeaders(): Record<string, string> {
    if (this.credentials.type === "ticket") {
      return {
        Cookie: `PVEAuthCookie=${this.credentials.ticket}`,
        CSRFPreventionToken: this.credentials.csrfToken,
      };
    } else {
      // API token
      return {
        Authorization: `PVEAPIToken=${this.credentials.tokenId}=${this.credentials.tokenSecret}`,
      };
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    schema?: ZodType<T>,
    attempt = 0,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      ...this.getAuthHeaders(),
      "Content-Type": "application/json",
    };

    const fetchOptions: Record<string, unknown> = {
      method,
      headers,
      dispatcher: this.dispatcher,
    };

    if (body !== undefined && method !== "GET") {
      if (body instanceof URLSearchParams) {
        fetchOptions.body = body.toString();
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      } else {
        fetchOptions.body = JSON.stringify(body);
      }
    }

    try {
      const response = await undiciFetch(
        url,
        fetchOptions as Parameters<typeof undiciFetch>[1],
      );

      // Handle authentication errors
      if (response.status === 401) {
        throw new ProxmoxAuthError(
          "Authentication failed",
          401,
          path,
          await this.parseErrorResponse(response),
        );
      }

      // Handle other client/server errors
      if (!response.ok) {
        const errorBody = await this.parseErrorResponse(response);
        const error = new ProxmoxApiError(
          this.extractErrorMessage(errorBody) ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          path,
          errorBody,
        );

        // Retry 5xx errors (server errors are typically transient)
        if (response.status >= 500 && attempt < this.retryConfig.maxRetries) {
          const delay = Math.min(
            this.retryConfig.initialDelayMs * Math.pow(2, attempt),
            this.retryConfig.maxDelayMs,
          );
          await this.sleep(delay);
          return this.request<T>(method, path, body, schema, attempt + 1);
        }

        // Don't retry 4xx errors (client errors) or if max retries exceeded
        throw error;
      }

      // Parse successful response
      const data = await response.json();
      const unwrapped = this.unwrapResponse<T>(data);

      // Validate with schema if provided, otherwise return as-is
      return schema ? schema.parse(unwrapped) : unwrapped;
    } catch (error) {
      // Don't retry auth errors or API errors (already handled above)
      if (
        error instanceof ProxmoxAuthError ||
        error instanceof ProxmoxApiError
      ) {
        throw error;
      }

      // Retry on network errors
      if (attempt < this.retryConfig.maxRetries) {
        const delay = Math.min(
          this.retryConfig.initialDelayMs * Math.pow(2, attempt),
          this.retryConfig.maxDelayMs,
        );
        await this.sleep(delay);
        return this.request<T>(method, path, body, schema, attempt + 1);
      }

      // Max retries exceeded
      throw new ProxmoxError(
        `Request failed after ${this.retryConfig.maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        path,
      );
    }
  }

  /**
   * Parse error response from Proxmox
   */
  private async parseErrorResponse(response: {
    text(): Promise<string>;
  }): Promise<unknown> {
    try {
      const text = await response.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Extract error message from Proxmox error response
   */
  private extractErrorMessage(errorBody: unknown): string | null {
    if (typeof errorBody === "object" && errorBody !== null) {
      if ("errors" in errorBody) {
        const errors = errorBody.errors;
        if (typeof errors === "object" && errors !== null) {
          // Proxmox returns errors as { field: "error message" }
          const messages = Object.values(errors).filter(
            (v): v is string => typeof v === "string",
          );
          if (messages.length > 0) {
            return messages.join(", ");
          }
        }
      }
      if ("data" in errorBody && errorBody.data === null) {
        // Sometimes Proxmox returns { data: null } with no error message
        return null;
      }
    }
    return null;
  }

  /**
   * Unwrap Proxmox API response envelope
   */
  private unwrapResponse<T>(response: unknown): T {
    if (
      typeof response === "object" &&
      response !== null &&
      "data" in response
    ) {
      return (response as ProxmoxApiResponse<T>).data;
    }
    // Some endpoints don't wrap response
    return response as T;
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Public HTTP methods
  // ============================================================================

  async get<T>(path: string, schema?: ZodType<T>): Promise<T> {
    return this.request<T>("GET", path, undefined, schema);
  }

  async post<T>(path: string, body?: unknown, schema?: ZodType<T>): Promise<T> {
    return this.request<T>("POST", path, body, schema);
  }

  async put<T>(path: string, body?: unknown, schema?: ZodType<T>): Promise<T> {
    return this.request<T>("PUT", path, body, schema);
  }

  async delete<T>(path: string, schema?: ZodType<T>): Promise<T> {
    return this.request<T>("DELETE", path, undefined, schema);
  }
}

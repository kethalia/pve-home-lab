import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProxmoxClient } from "@/lib/proxmox/client";
import * as auth from "@/lib/proxmox/auth";
import type {
  ProxmoxApiTokenCredentials,
  ProxmoxTicketResponse,
} from "@/lib/proxmox/types";

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("login", () => {
    it("should login successfully and return ticket credentials", async () => {
      const mockResponse: ProxmoxTicketResponse = {
        ticket: "PVE:test-user:123456::abcdef",
        CSRFPreventionToken: "test-csrf-token",
        username: "root@pam",
        clustername: "test-cluster",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockResponse }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const credentials = await auth.login(
        "pve.example.com",
        8006,
        "root",
        "password123",
        "pam",
      );

      expect(credentials.type).toBe("ticket");
      expect(credentials.ticket).toBe(mockResponse.ticket);
      expect(credentials.csrfToken).toBe(mockResponse.CSRFPreventionToken);
      expect(credentials.expiresAt).toBeInstanceOf(Date);

      // Ticket should expire in ~2 hours
      const now = Date.now();
      const expiresIn = credentials.expiresAt.getTime() - now;
      expect(expiresIn).toBeGreaterThan(1.9 * 60 * 60 * 1000);
      expect(expiresIn).toBeLessThan(2.1 * 60 * 60 * 1000);

      // Check fetch was called correctly
      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/access/ticket",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "username=root%40pam&password=password123",
        }),
      );
    });

    it("should use default realm if not specified", async () => {
      const mockResponse: ProxmoxTicketResponse = {
        ticket: "PVE:test-user:123456::abcdef",
        CSRFPreventionToken: "test-csrf-token",
        username: "root@pam",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockResponse }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await auth.login("pve.example.com", 8006, "root", "password123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/access/ticket",
        expect.objectContaining({
          body: "username=root%40pam&password=password123",
        }),
      );
    });

    it("should throw error on login failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        auth.login("pve.example.com", 8006, "root", "wrong-password"),
      ).rejects.toThrow("Login failed: 401 Unauthorized");
    });
  });

  describe("refreshTicket", () => {
    it("should refresh ticket and update client credentials", async () => {
      const oldCredentials = {
        type: "ticket" as const,
        ticket: "old-ticket",
        csrfToken: "old-csrf",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // Expiring soon
      };

      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: oldCredentials,
      });

      const mockResponse: ProxmoxTicketResponse = {
        ticket: "new-ticket",
        CSRFPreventionToken: "new-csrf-token",
        username: "root@pam",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockResponse }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const newCredentials = await auth.refreshTicket(client);

      expect(newCredentials.type).toBe("ticket");
      expect(newCredentials.ticket).toBe("new-ticket");
      expect(newCredentials.csrfToken).toBe("new-csrf-token");

      // Verify client's credentials were updated
      const clientCredentials = client.getCredentials();
      expect(clientCredentials).toEqual(newCredentials);
    });

    it("should throw error when trying to refresh non-ticket credentials", async () => {
      const tokenCredentials: ProxmoxApiTokenCredentials = {
        type: "token",
        tokenId: "root@pam!test",
        tokenSecret: "secret",
      };

      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: tokenCredentials,
      });

      await expect(auth.refreshTicket(client)).rejects.toThrow(
        "Can only refresh ticket-based credentials",
      );
    });
  });

  describe("createTicketCredentials", () => {
    it("should create ticket credentials from API response", () => {
      const response: ProxmoxTicketResponse = {
        ticket: "test-ticket-value",
        CSRFPreventionToken: "test-csrf-value",
        username: "root@pam",
        clustername: "test-cluster",
      };

      const before = Date.now();
      const credentials = auth.createTicketCredentials(response);
      const after = Date.now();

      expect(credentials.type).toBe("ticket");
      expect(credentials.ticket).toBe("test-ticket-value");
      expect(credentials.csrfToken).toBe("test-csrf-value");

      // Verify expiry time is ~2 hours from now
      const expiresAt = credentials.expiresAt.getTime();
      const expectedExpiry = before + 2 * 60 * 60 * 1000;
      expect(expiresAt).toBeGreaterThanOrEqual(expectedExpiry);
      expect(expiresAt).toBeLessThanOrEqual(after + 2 * 60 * 60 * 1000);
    });
  });
});

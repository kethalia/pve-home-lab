import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProxmoxApiError,
  ProxmoxAuthError,
  ProxmoxError,
} from "@/lib/proxmox/errors";
import { ProxmoxClient } from "@/lib/proxmox/client";
import type {
  ProxmoxApiTokenCredentials,
  ProxmoxTicketCredentials,
} from "@/lib/proxmox/types";

describe("ProxmoxClient", () => {
  const mockTicketCredentials: ProxmoxTicketCredentials = {
    type: "ticket",
    ticket: "test-ticket",
    csrfToken: "test-csrf",
    username: "root@pam",
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
  };

  const mockTokenCredentials: ProxmoxApiTokenCredentials = {
    type: "token",
    tokenId: "root@pam!test-token",
    tokenSecret: "test-secret-uuid",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create client with default port 8006", () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      expect(client).toBeInstanceOf(ProxmoxClient);
    });

    it("should create client with custom port", () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        port: 9006,
        credentials: mockTokenCredentials,
      });

      expect(client).toBeInstanceOf(ProxmoxClient);
    });
  });

  describe("authentication headers", () => {
    it("should set ticket auth headers", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTicketCredentials,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { test: "value" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.get("/test");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/test",
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: "PVEAuthCookie=test-ticket",
            CSRFPreventionToken: "test-csrf",
          }),
        }),
      );
    });

    it("should set API token auth headers", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { test: "value" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.get("/test");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/test",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "PVEAPIToken=root@pam!test-token=test-secret-uuid",
          }),
        }),
      );
    });
  });

  describe("response handling", () => {
    it("should unwrap successful response", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { vmid: 100, name: "test-ct" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.get<{ vmid: number; name: string }>("/test");

      expect(result).toEqual({ vmid: 100, name: "test-ct" });
    });

    it("should handle response without data wrapper", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ vmid: 100, name: "test-ct" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.get<{ vmid: number; name: string }>("/test");

      expect(result).toEqual({ vmid: 100, name: "test-ct" });
    });
  });

  describe("error handling", () => {
    it("should throw ProxmoxAuthError on 401", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => JSON.stringify({ errors: { auth: "Invalid token" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.get("/test")).rejects.toThrow(ProxmoxAuthError);
    });

    it("should throw ProxmoxApiError on 400", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () =>
          JSON.stringify({ errors: { vmid: "VMID already exists" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.get("/test")).rejects.toThrow(ProxmoxApiError);
      await expect(client.get("/test")).rejects.toThrow("VMID already exists");
    });

    it("should retry and then throw ProxmoxApiError on 500", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 10,
        },
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => JSON.stringify({}),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.get("/test")).rejects.toThrow(ProxmoxApiError);
      // Should retry 5xx errors
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe("retry logic", () => {
    it("should retry on network error", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 100,
          maxDelayMs: 1000,
        },
      });

      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { success: true } }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.get("/test");

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should not retry on auth error", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
        retryConfig: {
          maxRetries: 3,
        },
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => JSON.stringify({}),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.get("/test")).rejects.toThrow(ProxmoxAuthError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should fail after max retries", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 10,
        },
      });

      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.get("/test")).rejects.toThrow(ProxmoxError);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe("HTTP methods", () => {
    it("should make GET request", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.get("/nodes");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes",
        expect.objectContaining({
          method: "GET",
        }),
      );
    });

    it("should make POST request with JSON body", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:test" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.post("/nodes/pve/lxc", { vmid: 100 });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ vmid: 100 }),
        }),
      );
    });

    it("should make POST request with URLSearchParams body", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:test" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const params = new URLSearchParams({ vmid: "100" });
      await client.post("/nodes/pve/lxc", params);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc",
        expect.objectContaining({
          method: "POST",
          body: "vmid=100",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        }),
      );
    });

    it("should make DELETE request", async () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:test" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.delete("/nodes/pve/lxc/100");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc/100",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
    });
  });

  describe("credential management", () => {
    it("should update credentials", () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      const newCredentials: ProxmoxTicketCredentials = {
        type: "ticket",
        ticket: "new-ticket",
        csrfToken: "new-csrf",
        username: "root@pam",
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      };

      client.updateCredentials(newCredentials);
      expect(client.getCredentials()).toEqual(newCredentials);
    });

    it("should detect ticket needs refresh", () => {
      const soonToExpire = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: {
          type: "ticket",
          ticket: "test-ticket",
          csrfToken: "test-csrf",
          username: "root@pam",
          expiresAt: soonToExpire,
        },
      });

      expect(client.needsTicketRefresh()).toBe(true);
    });

    it("should not need refresh for API token", () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTokenCredentials,
      });

      expect(client.needsTicketRefresh()).toBe(false);
    });

    it("should not need refresh for fresh ticket", () => {
      const client = new ProxmoxClient({
        host: "pve.example.com",
        credentials: mockTicketCredentials,
      });

      expect(client.needsTicketRefresh()).toBe(false);
    });
  });
});

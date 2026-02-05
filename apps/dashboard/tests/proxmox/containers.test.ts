import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProxmoxClient } from "@/lib/proxmox/client";
import * as containers from "@/lib/proxmox/containers";
import type {
  ProxmoxApiTokenCredentials,
  ProxmoxContainer,
  ProxmoxContainerConfig,
  ProxmoxContainerStatus,
} from "@/lib/proxmox/types";

describe("containers", () => {
  let client: ProxmoxClient;
  const mockCredentials: ProxmoxApiTokenCredentials = {
    type: "token",
    tokenId: "root@pam!test",
    tokenSecret: "secret",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ProxmoxClient({
      host: "pve.example.com",
      credentials: mockCredentials,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listContainers", () => {
    it("should list all containers on a node", async () => {
      const mockContainers: ProxmoxContainer[] = [
        {
          vmid: 100,
          status: "running",
          name: "test-ct-1",
          type: "lxc",
          cpus: 2,
          maxmem: 2147483648,
        },
        {
          vmid: 101,
          status: "stopped",
          name: "test-ct-2",
          type: "lxc",
          cpus: 1,
          maxmem: 1073741824,
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockContainers }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await containers.listContainers(client, "pve");

      expect(result).toEqual(mockContainers);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc",
        expect.any(Object),
      );
    });
  });

  describe("createContainer", () => {
    it("should create container with minimal config", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:pve:00001234:00000000:test" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const upid = await containers.createContainer(client, "pve", {
        ostemplate: "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst",
      });

      expect(upid).toBe("UPID:pve:00001234:00000000:test");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("ostemplate="),
        }),
      );
    });

    it("should create container with full config", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:pve:00001234:00000000:test" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await containers.createContainer(client, "pve", {
        vmid: 100,
        ostemplate: "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst",
        hostname: "test-ct",
        description: "Test container",
        memory: 2048,
        swap: 512,
        cores: 2,
        rootfs: "local-lvm:8",
        net0: "name=eth0,bridge=vmbr0,ip=dhcp",
        password: "secret",
        unprivileged: true,
        features: "nesting=1,keyctl=1",
        onboot: true,
        start: true,
      });

      const call = mockFetch.mock.calls[0];
      const body = call[1].body as string;

      expect(body).toContain("vmid=100");
      expect(body).toContain("hostname=test-ct");
      expect(body).toContain("memory=2048");
      expect(body).toContain("cores=2");
      expect(body).toContain("unprivileged=1");
      expect(body).toContain("onboot=1");
      expect(body).toContain("start=1");
    });
  });

  describe("getContainer", () => {
    it("should get container status", async () => {
      const mockStatus: ProxmoxContainerStatus = {
        vmid: 100,
        status: "running",
        name: "test-ct",
        cpus: 2,
        maxmem: 2147483648,
        mem: 536870912,
        uptime: 123456,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockStatus }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await containers.getContainer(client, "pve", 100);

      expect(result).toEqual(mockStatus);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc/100/status/current",
        expect.any(Object),
      );
    });
  });

  describe("getContainerConfig", () => {
    it("should get container configuration", async () => {
      const mockConfig: ProxmoxContainerConfig = {
        hostname: "test-ct",
        cores: 2,
        memory: 2048,
        swap: 512,
        rootfs: "local-lvm:vm-100-disk-0,size=8G",
        unprivileged: true,
        features: "nesting=1,keyctl=1",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockConfig }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await containers.getContainerConfig(client, "pve", 100);

      expect(result).toEqual(mockConfig);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc/100/config",
        expect.any(Object),
      );
    });
  });

  describe("startContainer", () => {
    it("should start a container", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:pve:00001234:00000000:start" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const upid = await containers.startContainer(client, "pve", 100);

      expect(upid).toBe("UPID:pve:00001234:00000000:start");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc/100/status/start",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
  });

  describe("stopContainer", () => {
    it("should stop a container", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:pve:00001234:00000000:stop" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const upid = await containers.stopContainer(client, "pve", 100);

      expect(upid).toBe("UPID:pve:00001234:00000000:stop");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc/100/status/stop",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
  });

  describe("shutdownContainer", () => {
    it("should shutdown a container without timeout", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:pve:00001234:00000000:shutdown" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const upid = await containers.shutdownContainer(client, "pve", 100);

      expect(upid).toBe("UPID:pve:00001234:00000000:shutdown");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc/100/status/shutdown",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("should shutdown a container with timeout", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:pve:00001234:00000000:shutdown" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await containers.shutdownContainer(client, "pve", 100, 60);

      const call = mockFetch.mock.calls[0];
      const body = call[1].body as string;
      expect(body).toContain("timeout=60");
    });
  });

  describe("deleteContainer", () => {
    it("should delete a container without purge", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:pve:00001234:00000000:delete" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const upid = await containers.deleteContainer(client, "pve", 100);

      expect(upid).toBe("UPID:pve:00001234:00000000:delete");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc/100",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
    });

    it("should delete a container with purge", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: "UPID:pve:00001234:00000000:delete" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await containers.deleteContainer(client, "pve", 100, true);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pve.example.com:8006/api2/json/nodes/pve/lxc/100?purge=1",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
    });
  });
});

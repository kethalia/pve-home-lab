import { describe, it, expect } from "vitest";
import { prisma } from "./setup";
import { encrypt } from "../src/lib/encryption";

describe("Database Schema Relations", () => {
  describe("ProxmoxNode → Container relation", () => {
    it("should create a ProxmoxNode with containers", async () => {
      const node = await prisma.proxmoxNode.create({
        data: {
          name: "pve-node-1",
          host: "192.168.1.100",
          port: 8006,
          tokenId: "test@pam!token",
          tokenSecret: encrypt("test-secret"),
          fingerprint: "AA:BB:CC:DD:EE:FF",
          containers: {
            create: [
              {
                vmid: 100,
                hostname: "test-container-1",
                status: "running",
                cores: 2,
                memory: 4096,
                swap: 4096,
                diskSize: 10,
                rootPassword: encrypt("password123"),
              },
              {
                vmid: 101,
                hostname: "test-container-2",
                status: "stopped",
                cores: 4,
                memory: 8192,
                swap: 8192,
                diskSize: 20,
                rootPassword: encrypt("password456"),
              },
            ],
          },
        },
        include: {
          containers: true,
        },
      });

      expect(node.containers).toHaveLength(2);
      expect(node.containers[0].vmid).toBe(100);
      expect(node.containers[1].vmid).toBe(101);
    });
  });

  describe("Template → Scripts, Files, Packages relations", () => {
    it("should create a template with scripts, files, and packages", async () => {
      const template = await prisma.template.create({
        data: {
          name: "Test Template",
          description: "A test template",
          source: "custom",
          cores: 4,
          memory: 8192,
          diskSize: 20,
          unprivileged: true,
          nesting: true,
          scripts: {
            create: [
              {
                name: "00-setup.sh",
                order: 0,
                content: "#!/bin/bash\necho 'Setup'",
                description: "Initial setup script",
              },
              {
                name: "01-install.sh",
                order: 1,
                content: "#!/bin/bash\napt-get update",
                description: "Install dependencies",
              },
            ],
          },
          files: {
            create: [
              {
                name: "bashrc",
                targetPath: "/home/user/.bashrc",
                policy: "default",
                content: "alias ll='ls -la'",
              },
              {
                name: "gitconfig",
                targetPath: "/home/user/.gitconfig",
                policy: "replace",
                content: "[user]\n\tname = Test User",
              },
            ],
          },
          packages: {
            create: [
              { name: "curl", manager: "apt" },
              { name: "git", manager: "apt" },
              { name: "express", manager: "npm" },
            ],
          },
        },
        include: {
          scripts: true,
          files: true,
          packages: true,
        },
      });

      expect(template.scripts).toHaveLength(2);
      expect(template.files).toHaveLength(2);
      expect(template.packages).toHaveLength(3);
      expect(template.scripts[0].order).toBe(0);
      expect(template.files[0].policy).toBe("default");
      expect(template.packages[0].manager).toBe("apt");
    });

    it("should cascade delete scripts, files, and packages when template is deleted", async () => {
      const template = await prisma.template.create({
        data: {
          name: "Template to Delete",
          description: "Will be deleted",
          scripts: {
            create: [
              {
                name: "script.sh",
                order: 0,
                content: "echo test",
              },
            ],
          },
          files: {
            create: [
              {
                name: "config",
                targetPath: "/etc/config",
                policy: "replace",
                content: "config=true",
              },
            ],
          },
          packages: {
            create: [{ name: "vim", manager: "apt" }],
          },
        },
      });

      // Verify they exist
      const scriptsBefore = await prisma.templateScript.count({
        where: { templateId: template.id },
      });
      const filesBefore = await prisma.templateFile.count({
        where: { templateId: template.id },
      });
      const packagesBefore = await prisma.package.count({
        where: { templateId: template.id },
      });

      expect(scriptsBefore).toBe(1);
      expect(filesBefore).toBe(1);
      expect(packagesBefore).toBe(1);

      // Delete template
      await prisma.template.delete({
        where: { id: template.id },
      });

      // Verify cascading delete
      const scriptsAfter = await prisma.templateScript.count({
        where: { templateId: template.id },
      });
      const filesAfter = await prisma.templateFile.count({
        where: { templateId: template.id },
      });
      const packagesAfter = await prisma.package.count({
        where: { templateId: template.id },
      });

      expect(scriptsAfter).toBe(0);
      expect(filesAfter).toBe(0);
      expect(packagesAfter).toBe(0);
    });
  });

  describe("PackageBucket → Package relation", () => {
    it("should create package bucket with packages", async () => {
      const bucket = await prisma.packageBucket.create({
        data: {
          name: "base-packages",
          description: "Base system packages",
          packages: {
            create: [
              { name: "curl", manager: "apt" },
              { name: "wget", manager: "apt" },
              { name: "git", manager: "apt" },
            ],
          },
        },
        include: {
          packages: true,
        },
      });

      expect(bucket.packages).toHaveLength(3);
      expect(bucket.packages.every((p) => p.bucketId === bucket.id)).toBe(true);
    });

    it("should cascade delete packages when bucket is deleted", async () => {
      const bucket = await prisma.packageBucket.create({
        data: {
          name: "temp-bucket",
          packages: {
            create: [
              { name: "package1", manager: "apt" },
              { name: "package2", manager: "npm" },
            ],
          },
        },
      });

      const packageCountBefore = await prisma.package.count({
        where: { bucketId: bucket.id },
      });
      expect(packageCountBefore).toBe(2);

      await prisma.packageBucket.delete({
        where: { id: bucket.id },
      });

      const packageCountAfter = await prisma.package.count({
        where: { bucketId: bucket.id },
      });
      expect(packageCountAfter).toBe(0);
    });
  });

  describe("Container → Services & Events relations", () => {
    it("should create container with services and events", async () => {
      const node = await prisma.proxmoxNode.create({
        data: {
          name: "test-node",
          host: "192.168.1.10",
          tokenId: "token",
          tokenSecret: encrypt("secret"),
        },
      });

      const container = await prisma.container.create({
        data: {
          vmid: 200,
          hostname: "web-server",
          status: "running",
          cores: 2,
          memory: 2048,
          swap: 2048,
          diskSize: 10,
          rootPassword: encrypt("root123"),
          nodeId: node.id,
          services: {
            create: [
              {
                name: "nginx",
                type: "systemd",
                port: 80,
                status: "running",
                webUrl: "http://192.168.1.200",
              },
              {
                name: "postgres",
                type: "docker",
                port: 5432,
                status: "running",
                credentials: JSON.stringify({
                  user: "admin",
                  password: "secret",
                }),
              },
            ],
          },
          events: {
            create: [
              {
                type: "created",
                message: "Container created successfully",
              },
              {
                type: "started",
                message: "Container started",
              },
              {
                type: "service_ready",
                message: "Nginx service is ready",
                metadata: JSON.stringify({ service: "nginx", port: 80 }),
              },
            ],
          },
        },
        include: {
          services: true,
          events: true,
        },
      });

      expect(container.services).toHaveLength(2);
      expect(container.events).toHaveLength(3);
      expect(container.services[0].type).toBe("systemd");
      expect(container.events[0].type).toBe("created");
    });

    it("should cascade delete services and events when container is deleted", async () => {
      const node = await prisma.proxmoxNode.create({
        data: {
          name: "delete-test-node",
          host: "192.168.1.20",
          tokenId: "token",
          tokenSecret: encrypt("secret"),
        },
      });

      const container = await prisma.container.create({
        data: {
          vmid: 300,
          hostname: "temp-container",
          status: "creating",
          cores: 1,
          memory: 1024,
          swap: 1024,
          diskSize: 5,
          rootPassword: encrypt("pass"),
          nodeId: node.id,
          services: {
            create: [
              {
                name: "service1",
                type: "systemd",
                status: "installing",
              },
            ],
          },
          events: {
            create: [
              {
                type: "created",
                message: "Container creation started",
              },
            ],
          },
        },
      });

      const servicesBefore = await prisma.containerService.count({
        where: { containerId: container.id },
      });
      const eventsBefore = await prisma.containerEvent.count({
        where: { containerId: container.id },
      });

      expect(servicesBefore).toBe(1);
      expect(eventsBefore).toBe(1);

      // Delete container
      await prisma.container.delete({
        where: { id: container.id },
      });

      const servicesAfter = await prisma.containerService.count({
        where: { containerId: container.id },
      });
      const eventsAfter = await prisma.containerEvent.count({
        where: { containerId: container.id },
      });

      expect(servicesAfter).toBe(0);
      expect(eventsAfter).toBe(0);
    });
  });

  describe("Indexes", () => {
    it("should efficiently query by vmid (indexed)", async () => {
      const node = await prisma.proxmoxNode.create({
        data: {
          name: "index-test-node",
          host: "192.168.1.30",
          tokenId: "token",
          tokenSecret: encrypt("secret"),
        },
      });

      await prisma.container.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          vmid: 1000 + i,
          hostname: `container-${i}`,
          status: i % 2 === 0 ? "running" : "stopped",
          cores: 2,
          memory: 2048,
          swap: 2048,
          diskSize: 10,
          rootPassword: encrypt("pass"),
          nodeId: node.id,
        })),
      });

      // Query by vmid (should use index)
      const container = await prisma.container.findUnique({
        where: { vmid: 1005 },
      });

      expect(container).toBeTruthy();
      expect(container?.hostname).toBe("container-5");
    });

    it("should efficiently query by status (indexed)", async () => {
      const node = await prisma.proxmoxNode.create({
        data: {
          name: "status-test-node",
          host: "192.168.1.40",
          tokenId: "token",
          tokenSecret: encrypt("secret"),
        },
      });

      await prisma.container.createMany({
        data: [
          {
            vmid: 2000,
            hostname: "running-1",
            status: "running",
            cores: 2,
            memory: 2048,
            swap: 2048,
            diskSize: 10,
            rootPassword: encrypt("pass"),
            nodeId: node.id,
          },
          {
            vmid: 2001,
            hostname: "running-2",
            status: "running",
            cores: 2,
            memory: 2048,
            swap: 2048,
            diskSize: 10,
            rootPassword: encrypt("pass"),
            nodeId: node.id,
          },
          {
            vmid: 2002,
            hostname: "stopped-1",
            status: "stopped",
            cores: 2,
            memory: 2048,
            swap: 2048,
            diskSize: 10,
            rootPassword: encrypt("pass"),
            nodeId: node.id,
          },
        ],
      });

      // Query by status (should use index)
      const runningContainers = await prisma.container.findMany({
        where: { status: "running" },
      });

      expect(runningContainers).toHaveLength(2);
    });

    it("should efficiently query container events by containerId and createdAt (compound index)", async () => {
      const node = await prisma.proxmoxNode.create({
        data: {
          name: "event-test-node",
          host: "192.168.1.50",
          tokenId: "token",
          tokenSecret: encrypt("secret"),
        },
      });

      const container = await prisma.container.create({
        data: {
          vmid: 3000,
          hostname: "event-container",
          status: "running",
          cores: 2,
          memory: 2048,
          swap: 2048,
          diskSize: 10,
          rootPassword: encrypt("pass"),
          nodeId: node.id,
        },
      });

      // Create events with different timestamps
      await prisma.containerEvent.createMany({
        data: [
          {
            containerId: container.id,
            type: "created",
            message: "Event 1",
            createdAt: new Date("2026-01-01T10:00:00Z"),
          },
          {
            containerId: container.id,
            type: "started",
            message: "Event 2",
            createdAt: new Date("2026-01-01T11:00:00Z"),
          },
          {
            containerId: container.id,
            type: "service_ready",
            message: "Event 3",
            createdAt: new Date("2026-01-01T12:00:00Z"),
          },
        ],
      });

      // Query events ordered by createdAt (should use compound index)
      const events = await prisma.containerEvent.findMany({
        where: { containerId: container.id },
        orderBy: { createdAt: "desc" },
      });

      expect(events).toHaveLength(3);
      expect(events[0].message).toBe("Event 3"); // Most recent
      expect(events[2].message).toBe("Event 1"); // Oldest
    });
  });

  describe("Unique constraints", () => {
    it("should enforce unique ProxmoxNode name", async () => {
      await prisma.proxmoxNode.create({
        data: {
          name: "unique-node",
          host: "192.168.1.60",
          tokenId: "token",
          tokenSecret: encrypt("secret"),
        },
      });

      await expect(
        prisma.proxmoxNode.create({
          data: {
            name: "unique-node", // Duplicate name
            host: "192.168.1.61",
            tokenId: "token2",
            tokenSecret: encrypt("secret2"),
          },
        }),
      ).rejects.toThrow();
    });

    it("should enforce unique Template name", async () => {
      await prisma.template.create({
        data: {
          name: "unique-template",
          description: "First template",
        },
      });

      await expect(
        prisma.template.create({
          data: {
            name: "unique-template", // Duplicate name
            description: "Second template",
          },
        }),
      ).rejects.toThrow();
    });

    it("should enforce unique Container vmid", async () => {
      const node = await prisma.proxmoxNode.create({
        data: {
          name: "vmid-test-node",
          host: "192.168.1.70",
          tokenId: "token",
          tokenSecret: encrypt("secret"),
        },
      });

      await prisma.container.create({
        data: {
          vmid: 4000,
          hostname: "container-1",
          status: "running",
          cores: 2,
          memory: 2048,
          swap: 2048,
          diskSize: 10,
          rootPassword: encrypt("pass"),
          nodeId: node.id,
        },
      });

      await expect(
        prisma.container.create({
          data: {
            vmid: 4000, // Duplicate vmid
            hostname: "container-2",
            status: "running",
            cores: 2,
            memory: 2048,
            swap: 2048,
            diskSize: 10,
            rootPassword: encrypt("pass"),
            nodeId: node.id,
          },
        }),
      ).rejects.toThrow();
    });
  });
});

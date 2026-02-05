/**
 * Proxmox VE task tracking and polling
 */

import "server-only";
import { z } from "zod";
import { ProxmoxTaskError } from "./errors.js";
import type { ProxmoxClient } from "./client.js";
import { TaskStatusSchema, TaskLogEntrySchema } from "./schemas.js";
import type {
  ProxmoxTaskLogEntry,
  ProxmoxTaskStatus,
  ProxmoxTaskWaitOptions,
} from "./types.js";

/**
 * Get status of a task
 */
export async function getTaskStatus(
  client: ProxmoxClient,
  node: string,
  upid: string,
): Promise<ProxmoxTaskStatus> {
  return client.get(`/nodes/${node}/tasks/${upid}/status`, TaskStatusSchema);
}

/**
 * Get task log
 */
export async function getTaskLog(
  client: ProxmoxClient,
  node: string,
  upid: string,
  start = 0,
  limit = 50,
): Promise<ProxmoxTaskLogEntry[]> {
  return client.get(
    `/nodes/${node}/tasks/${upid}/log?start=${start}&limit=${limit}`,
    z.array(TaskLogEntrySchema),
  );
}

/**
 * Wait for a task to complete, with optional progress callback
 *
 * @param client - Proxmox client instance
 * @param node - Node name
 * @param upid - Task UPID
 * @param options - Wait options including interval, timeout, progress callback, and abort signal
 * @returns Task status when completed
 * @throws ProxmoxTaskError if task fails, times out, or is aborted
 */
export async function waitForTask(
  client: ProxmoxClient,
  node: string,
  upid: string,
  options: ProxmoxTaskWaitOptions = {},
): Promise<ProxmoxTaskStatus> {
  const interval = options.interval ?? 2000; // 2 seconds
  const timeout = options.timeout ?? 300000; // 5 minutes
  const startTime = Date.now();

  let lastLogLine = 0;

  while (true) {
    // Check if aborted
    if (options.signal?.aborted) {
      throw new ProxmoxTaskError(
        `Task polling aborted: ${options.signal.reason || "Operation cancelled"}`,
        upid,
      );
    }

    // Check timeout
    if (Date.now() - startTime > timeout) {
      throw new ProxmoxTaskError(
        `Task polling timeout after ${timeout}ms`,
        upid,
      );
    }

    // Get current task status
    const status = await getTaskStatus(client, node, upid);

    // If task has stopped, check exit status
    if (status.status === "stopped") {
      // Fetch final log if progress callback is provided
      if (options.onProgress) {
        try {
          const log = await getTaskLog(client, node, upid, lastLogLine);
          if (log.length > 0) {
            options.onProgress(log);
          }
        } catch {
          // Log fetching is optional, silently continue on error
        }
      }

      // Check if task succeeded
      if (status.exitstatus === "OK") {
        return status;
      } else {
        // Task failed - get full log for error details
        let errorLog: string[] = [];
        try {
          const fullLog = await getTaskLog(client, node, upid, 0, 1000);
          errorLog = fullLog.map((entry) => entry.t);
        } catch {
          // If we can't get the log, continue with empty array
        }

        throw new ProxmoxTaskError(
          `Task failed: ${status.exitstatus || "Unknown error"}`,
          upid,
          status.exitstatus,
          errorLog,
        );
      }
    }

    // Task still running - fetch new log lines if callback provided
    if (options.onProgress) {
      try {
        const log = await getTaskLog(client, node, upid, lastLogLine);
        if (log.length > 0) {
          options.onProgress(log);
          // Update last line number for next iteration
          const maxLineNumber = Math.max(...log.map((entry) => entry.n));
          lastLogLine = maxLineNumber + 1;
        }
      } catch {
        // Log fetching is optional, silently continue on error
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

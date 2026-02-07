// Server-side module — do not import from client components

import { Client as SSHClient } from "ssh2";

// ============================================================================
// Types
// ============================================================================

export interface SSHConfig {
  host: string;
  port?: number; // default 22
  username: string;
  password: string;
  readyTimeout?: number; // default 10000
}

export interface SSHExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

// ============================================================================
// SSHSession — connection-reuse pattern
// ============================================================================

/**
 * Wraps an ssh2 Client with connection reuse.
 * Provides exec, streaming exec, and SFTP file upload.
 *
 * Usage:
 *   const ssh = new SSHSession({ host, username, password });
 *   const result = await ssh.exec("whoami");
 *   await ssh.uploadFile(scriptContent, "/tmp/setup.sh", 0o755);
 *   ssh.close();
 */
export class SSHSession {
  private conn: SSHClient;
  private ready: Promise<void>;

  constructor(config: SSHConfig) {
    this.conn = new SSHClient();
    this.ready = new Promise<void>((resolve, reject) => {
      this.conn
        .on("ready", resolve)
        .on("error", reject)
        .connect({
          host: config.host,
          port: config.port ?? 22,
          username: config.username,
          password: config.password,
          readyTimeout: config.readyTimeout ?? 10000,
        });
    });
  }

  /**
   * Execute a command and collect stdout/stderr as strings.
   */
  async exec(command: string): Promise<SSHExecResult> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) return reject(err);

        let stdout = "";
        let stderr = "";

        stream
          .on("close", (code: number) => {
            resolve({ stdout, stderr, code });
          })
          .on("data", (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  /**
   * Execute a command and stream stdout/stderr line-by-line via callback.
   * Returns the exit code.
   */
  async execStreaming(
    command: string,
    onOutput: (line: string, isStderr: boolean) => void,
  ): Promise<number> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) return reject(err);

        stream
          .on("close", (code: number) => {
            resolve(code);
          })
          .on("data", (data: Buffer) => {
            data
              .toString()
              .split("\n")
              .filter(Boolean)
              .forEach((line) => onOutput(line, false));
          })
          .stderr.on("data", (data: Buffer) => {
            data
              .toString()
              .split("\n")
              .filter(Boolean)
              .forEach((line) => onOutput(line, true));
          });
      });
    });
  }

  /**
   * Upload a file via SFTP.
   */
  async uploadFile(
    content: string | Buffer,
    remotePath: string,
    mode?: number,
  ): Promise<void> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);

        const writeStream = sftp.createWriteStream(remotePath, {
          mode: mode ?? 0o644,
        });

        writeStream.on("close", () => {
          resolve();
        });

        writeStream.on("error", (writeErr: Error) => {
          reject(writeErr);
        });

        writeStream.end(content);
      });
    });
  }

  /**
   * Close the SSH connection.
   */
  close(): void {
    this.conn.end();
  }
}

// ============================================================================
// connectWithRetry — exponential backoff for new containers
// ============================================================================

/**
 * Connect to SSH with retry and exponential backoff.
 * Useful for newly created containers where SSH takes seconds to start.
 *
 * Default: 5 attempts, 2000ms initial delay (2s → 4s → 8s → 16s → 32s).
 */
export async function connectWithRetry(
  config: SSHConfig,
  options?: { maxAttempts?: number; initialDelay?: number },
): Promise<SSHSession> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const initialDelay = options?.initialDelay ?? 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const session = new SSHSession(config);
      // Wait for the ready promise to confirm connection
      await session.exec("echo ok");
      return session;
    } catch (err) {
      if (attempt === maxAttempts) {
        throw new Error(
          `SSH connection failed after ${maxAttempts} attempts: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const delay = initialDelay * Math.pow(2, attempt - 1);
      console.log(
        `SSH connection attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("SSH connection failed");
}

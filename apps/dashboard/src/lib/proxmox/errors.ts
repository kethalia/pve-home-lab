/**
 * Proxmox VE API error classes
 */

export class ProxmoxError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = "ProxmoxError";
    Object.setPrototypeOf(this, ProxmoxError.prototype);
  }
}

export class ProxmoxAuthError extends ProxmoxError {
  constructor(
    message: string,
    statusCode?: number,
    endpoint?: string,
    responseBody?: unknown,
  ) {
    super(message, statusCode, endpoint, responseBody);
    this.name = "ProxmoxAuthError";
    Object.setPrototypeOf(this, ProxmoxAuthError.prototype);
  }
}

export class ProxmoxApiError extends ProxmoxError {
  constructor(
    message: string,
    statusCode?: number,
    endpoint?: string,
    responseBody?: unknown,
  ) {
    super(message, statusCode, endpoint, responseBody);
    this.name = "ProxmoxApiError";
    Object.setPrototypeOf(this, ProxmoxApiError.prototype);
  }
}

export class ProxmoxTaskError extends ProxmoxError {
  constructor(
    message: string,
    public readonly upid: string,
    public readonly exitStatus?: string,
    public readonly taskLog?: string[],
  ) {
    super(message);
    this.name = "ProxmoxTaskError";
    Object.setPrototypeOf(this, ProxmoxTaskError.prototype);
  }
}

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Get encryption key from environment variable.
 * The key should be a 64-character hex string (32 bytes).
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. Please configure it in your .env file.",
    );
  }

  if (keyHex.length !== KEY_LENGTH * 2) {
    throw new Error(
      `ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH} bytes).`,
    );
  }

  return Buffer.from(keyHex, "hex");
}

/**
 * Generate a random encryption key (for initial setup).
 * Returns a 64-character hex string.
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString("hex");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string in the format: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Combine iv, authTag, and ciphertext with colons
  const combined = `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext}`;

  // Return as base64 for cleaner storage
  return Buffer.from(combined).toString("base64");
}

/**
 * Decrypt a ciphertext string that was encrypted with encrypt().
 * Expects a base64-encoded string in the format: iv:authTag:ciphertext
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();

  // Decode from base64
  const combined = Buffer.from(encryptedData, "base64").toString("utf8");

  // Split into components
  const parts = combined.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted data format. Expected iv:authTag:ciphertext",
    );
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  // Validate auth tag length
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Invalid auth tag length. Expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length} bytes.`,
    );
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, "hex", "utf8");
  plaintext += decipher.final("utf8");

  return plaintext;
}

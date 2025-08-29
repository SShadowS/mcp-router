/**
 * Encryption utilities for OAuth sensitive data
 * Uses Node.js crypto module for AES-256-GCM encryption
 */

import crypto from "crypto";
import { app } from "electron";
import path from "path";
import fs from "fs";

// Encryption algorithm
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64; // 512 bits

/**
 * Get or create encryption key for OAuth data
 * The key is derived from machine-specific data and stored securely
 */
function getEncryptionKey(): Buffer {
  // Use app.getPath('userData') to store the key file
  const keyPath = path.join(app.getPath("userData"), ".oauth-key");

  try {
    // Try to read existing key
    if (fs.existsSync(keyPath)) {
      const keyData = fs.readFileSync(keyPath);
      if (keyData.length === KEY_LENGTH) {
        return keyData;
      }
    }
  } catch (error) {
    // Key doesn't exist or is invalid, will create new one
  }

  // Generate new key
  const key = crypto.randomBytes(KEY_LENGTH);

  try {
    // Save key to file with restricted permissions
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
  } catch (error) {
    console.error("Failed to save encryption key:", error);
  }

  return key;
}

/**
 * Encrypt sensitive OAuth data
 * @param plaintext The data to encrypt
 * @returns Encrypted data with IV and auth tag
 */
export function encryptOAuthData(plaintext: string): string {
  if (!plaintext) {
    return "";
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    const combined = Buffer.concat([iv, authTag, encrypted]);

    // Return base64 encoded string
    return combined.toString("base64");
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Failed to encrypt OAuth data");
  }
}

/**
 * Decrypt sensitive OAuth data
 * @param encryptedData The encrypted data as base64 string
 * @returns Decrypted plaintext
 */
export function decryptOAuthData(encryptedData: string): string {
  if (!encryptedData) {
    return "";
  }

  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, "base64");

    // Extract IV, auth tag, and encrypted data
    const iv = combined.slice(0, IV_LENGTH);
    const authTag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.slice(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Failed to decrypt OAuth data");
  }
}

/**
 * Hash sensitive data for comparison without decryption
 * Useful for checking if two encrypted values are the same
 */
export function hashOAuthData(data: string): string {
  if (!data) {
    return "";
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(data, salt, 10000, 64, "sha512");

  // Combine salt and hash
  const combined = Buffer.concat([salt, hash]);
  return combined.toString("base64");
}

/**
 * Verify hashed OAuth data
 */
export function verifyHashedOAuthData(
  data: string,
  hashedData: string,
): boolean {
  if (!data || !hashedData) {
    return false;
  }

  try {
    const combined = Buffer.from(hashedData, "base64");
    const salt = combined.slice(0, SALT_LENGTH);
    const originalHash = combined.slice(SALT_LENGTH);

    const hash = crypto.pbkdf2Sync(data, salt, 10000, 64, "sha512");

    return crypto.timingSafeEqual(originalHash, hash);
  } catch (error) {
    console.error("Hash verification failed:", error);
    return false;
  }
}

/**
 * Encrypt OAuth configuration object
 * Encrypts only sensitive fields
 */
export function encryptOAuthConfig(config: any): any {
  const encrypted = { ...config };

  // List of sensitive fields to encrypt
  const sensitiveFields = [
    "clientSecret",
    "accessToken",
    "refreshToken",
    "idToken",
  ];

  for (const field of sensitiveFields) {
    if (encrypted[field]) {
      encrypted[field] = encryptOAuthData(encrypted[field]);
    }
  }

  return encrypted;
}

/**
 * Decrypt OAuth configuration object
 */
export function decryptOAuthConfig(config: any): any {
  const decrypted = { ...config };

  // List of sensitive fields to decrypt
  const sensitiveFields = [
    "clientSecret",
    "accessToken",
    "refreshToken",
    "idToken",
  ];

  for (const field of sensitiveFields) {
    if (decrypted[field]) {
      try {
        decrypted[field] = decryptOAuthData(decrypted[field]);
      } catch (error) {
        console.error(`Failed to decrypt ${field}:`, error);
        // Keep encrypted value if decryption fails
      }
    }
  }

  return decrypted;
}

/**
 * Generate a secure random string for OAuth state/verifier
 */
export function generateSecureRandom(length: number): string {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

/**
 * Generate code challenge for PKCE
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Encryption utility class wrapper
 */
export class EncryptionUtil {
  private key: Buffer;

  constructor() {
    this.key = getEncryptionKey();
  }

  encrypt(data: string): string {
    return encryptOAuthData(data);
  }

  decrypt(data: string): string {
    return decryptOAuthData(data);
  }

  hash(data: string): string {
    return hashOAuthData(data);
  }

  verify(data: string, hashedData: string): boolean {
    return verifyHashedOAuthData(data, hashedData);
  }
}

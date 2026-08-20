import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class SecretBoxError extends Error {
  readonly code = "SECRET_BOX_FAILED";
}

function keyMaterial(): Buffer {
  const explicit = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (explicit && explicit.length >= 32) {
    return /^[0-9a-f]{64}$/i.test(explicit) ? Buffer.from(explicit, "hex") : createHash("sha256").update(explicit).digest();
  }
  const fallback = process.env.ADMIN_SESSION_SECRET?.trim();
  if (fallback && fallback.length >= 32) {
    return createHash("sha256").update(`jobform-integrations:${fallback}`).digest();
  }
  throw new SecretBoxError("INTEGRATION_ENCRYPTION_KEY is not configured.");
}

export function integrationEncryptionConfigured() {
  try {
    keyMaterial();
    return true;
  } catch {
    return false;
  }
}

/** AES-256-GCM. Stored as `v1.<iv>.<ciphertext>.<tag>` in base64url. */
export function encryptSecret(plaintext: string): string {
  const key = keyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new SecretBoxError("Encrypted secret is malformed.");
  const key = keyMaterial();
  const iv = Buffer.from(parts[1], "base64url");
  const encrypted = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

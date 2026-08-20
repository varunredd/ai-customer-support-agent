import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, saltB64, hashB64] = encoded.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");
  const actual = scryptSync(password, salt, expected.length, SCRYPT_PARAMS);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

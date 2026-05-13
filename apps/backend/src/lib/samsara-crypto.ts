import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const DEV_FALLBACK_SEED = "ih35-samsara-dev-encryption-key";

let warnedAboutFallback = false;

/**
 * SAMSARA_TOKEN_ENCRYPTION_KEY (hex, 32 bytes) preferred; falls back to ENCRYPTION_KEY in non-production.
 */
function resolveSamsaraEncryptionKey(): Buffer {
  const raw = process.env.SAMSARA_TOKEN_ENCRYPTION_KEY?.trim() || process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SAMSARA_TOKEN_ENCRYPTION_KEY (or ENCRYPTION_KEY) is required in production for Samsara secrets");
    }
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn("[samsara-crypto] SAMSARA_TOKEN_ENCRYPTION_KEY missing; using deterministic development fallback");
    }
    return crypto.createHash("sha256").update(DEV_FALLBACK_SEED).digest();
  }

  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("SAMSARA_TOKEN_ENCRYPTION_KEY must be a hex string");
  }

  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("SAMSARA_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

export function encryptSamsaraSecret(plain: string): Buffer {
  const key = resolveSamsaraEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptSamsaraSecret(payload: Buffer | null): string | null {
  if (!payload) return null;
  if (payload.length < IV_BYTES + AUTH_TAG_BYTES + 1) {
    throw new Error("Samsara encrypted payload is too short");
  }

  const key = resolveSamsaraEncryptionKey();
  const iv = payload.subarray(0, IV_BYTES);
  const authTag = payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const encrypted = payload.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

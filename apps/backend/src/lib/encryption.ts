import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const DEV_FALLBACK_SEED = "ih35-dev-encryption-key";

let warnedAboutFallback = false;

function resolveEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY is required in production");
    }
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn("[encryption] ENCRYPTION_KEY missing; using deterministic development fallback key");
    }
    return crypto.createHash("sha256").update(DEV_FALLBACK_SEED).digest();
  }

  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("ENCRYPTION_KEY must be a hex string");
  }

  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

export function encrypt(value: string): Buffer {
  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decrypt(payload: Buffer | null): string | null {
  if (!payload) return null;
  if (payload.length < IV_BYTES + AUTH_TAG_BYTES + 1) {
    throw new Error("Encrypted payload is too short");
  }

  const key = resolveEncryptionKey();
  const iv = payload.subarray(0, IV_BYTES);
  const authTag = payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const encrypted = payload.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

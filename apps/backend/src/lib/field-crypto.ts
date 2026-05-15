import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const b64 = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!b64) return Buffer.alloc(32, 0);
  const raw = Buffer.from(b64, "base64");
  if (raw.length === 32) return raw;
  return scryptSync(b64, "ih35-field-salt", 32);
}

export function encryptOptionalPlaintext(plain: string): string {
  if (!plain) return "";
  const k = key();
  if (k.every((b) => b === 0)) return `plain:${plain}`;
  const iv = randomBytes(12);
  const c = createCipheriv(ALGO, k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptOptionalCiphertext(encB64: string): string {
  if (!encB64) return "";
  if (encB64.startsWith("plain:")) return encB64.slice("plain:".length);
  const k = key();
  if (k.every((b) => b === 0)) return encB64;
  try {
    const buf = Buffer.from(encB64, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const d = createDecipheriv(ALGO, k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

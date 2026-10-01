/**
 * ROUND 306 E-10 — ONE Samsara token path for every engine.
 *
 * Measured live 2026-10-01: the fault poller and the harsh-events poller each died on their first
 * tick with "Unsupported state or unable to authenticate data" (AES-GCM decrypt of
 * integrations.samsara_config.encrypted_api_token failed), while other engines kept working.
 * Every engine now resolves its token here and nowhere else:
 *   1. decrypt encrypted_api_token (canonical), else api_token_encrypted (legacy);
 *   2. if neither decrypts to a non-empty token, fall back to the deployment's SAMSARA_API_TOKEN
 *      (the same env token SamsaraClient already falls back to), never a second secret;
 *   3. if nothing is available, throw `samsara_token_unavailable` naming the decrypt error.
 */
import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";

function buf(v: unknown): Buffer | null {
  return Buffer.isBuffer(v) && v.length > 0 ? v : null;
}

export function resolveSamsaraApiToken(config: Record<string, unknown> | null | undefined): string {
  let lastError: string | null = null;
  for (const candidate of [buf(config?.encrypted_api_token), buf(config?.api_token_encrypted)]) {
    if (!candidate) continue;
    try {
      const token = decryptSamsaraSecret(candidate)?.trim();
      if (token) return token;
    } catch (error) {
      lastError = String((error as Error)?.message ?? error);
    }
  }
  const env = process.env.SAMSARA_API_TOKEN?.trim() || process.env.SAMSARA_API_KEY?.trim() || process.env.SAMSARA_TOKEN?.trim() || "";
  if (env) return env;
  throw new Error(`samsara_token_unavailable${lastError ? `: ${lastError}` : ": no stored token and no SAMSARA_API_TOKEN"}`);
}

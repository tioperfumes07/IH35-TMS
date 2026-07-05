import { decrypt, encrypt } from "../../lib/encryption.js";

// G10-H5 (Security): the Plaid access token is a bank-grade credential and MUST NOT be
// stored in plaintext at rest. We REUSE the canonical AES-256-GCM helper in
// `lib/encryption.ts` (same ENCRYPTION_KEY, same primitive the PII columns use) — no new
// crypto math is written here. `encrypt()` returns a GCM envelope Buffer (iv|tag|ciphertext);
// we base64-package it so it fits the EXISTING `banking.bank_accounts.plaid_access_token TEXT`
// column WITHOUT a schema migration (Jorge's migration gate).
//
// BACKWARD COMPATIBILITY — no data migration required:
// Existing rows hold a RAW plaintext Plaid token. Plaid access tokens always have the shape
// `access-<environment>-<uuid>` (they start with "access-"); our encrypted envelope is
// standard base64 of the GCM buffer, which never starts with "access-". On READ we therefore
// treat any value that still looks like a raw Plaid token — OR that fails authenticated
// decryption — as legacy plaintext and return it unchanged. The next WRITE (token exchange or
// re-connect) re-persists it encrypted, so tokens migrate to ciphertext lazily, with zero
// downtime and no backfill.

const LEGACY_PLAINTEXT_PREFIX = "access-";

/** Encrypt a Plaid access token for at-rest storage in the TEXT column (base64 GCM envelope). */
export function encryptPlaidAccessToken(plain: string): string {
  return encrypt(plain).toString("base64");
}

/**
 * Decrypt a stored Plaid access token. Backward-compatible: legacy plaintext rows (a raw
 * `access-...` token, or any value that is not a valid encrypted envelope) are returned as-is,
 * so existing connections keep working with no data migration.
 */
export function decryptPlaidAccessToken(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  // Legacy plaintext: a real Plaid token stored before encryption was introduced.
  if (stored.startsWith(LEGACY_PLAINTEXT_PREFIX)) return stored;
  try {
    return decrypt(Buffer.from(stored, "base64"));
  } catch {
    // Not a valid encrypted envelope (auth-tag/length failure) → treat as legacy plaintext.
    // The prefix check above already covers the known legacy format; this is a defensive
    // fallback so a malformed/legacy value never throws in the request path.
    return stored;
  }
}

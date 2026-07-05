#!/usr/bin/env node
// G10-H5 (Security) static guard: the Plaid access token must NEVER be persisted in plaintext.
// Asserts every WRITE of banking.bank_accounts.plaid_access_token goes through the AES-256-GCM
// encrypt helper, every READ decrypts, and the crypto module REUSES lib/encryption.js (no new
// crypto math). Negative-tests that the raw token is not bound into the persistence value arrays.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "verify:plaid-token-encrypted-at-rest";

const cryptoPath = path.join(ROOT, "apps/backend/src/integrations/plaid/plaid-token-crypto.ts");
const servicePath = path.join(ROOT, "apps/backend/src/integrations/plaid/plaid.service.ts");
const linkRoutesPath = path.join(ROOT, "apps/backend/src/integrations/plaid/link.routes.ts");
const itemsRoutesPath = path.join(ROOT, "apps/backend/src/banking/plaid-items.routes.ts");

function fail(message) {
  console.error(`${NAME} FAIL: ${message}`);
  process.exit(1);
}

function read(target) {
  if (!fs.existsSync(target)) fail(`missing ${path.relative(ROOT, target)}`);
  return fs.readFileSync(target, "utf8");
}

const crypto = read(cryptoPath);
const service = read(servicePath);
const linkRoutes = read(linkRoutesPath);
const itemsRoutes = read(itemsRoutesPath);

// 1) Crypto module reuses the canonical helper — no bespoke cipher math.
if (!/from\s+["']\.\.\/\.\.\/lib\/encryption\.js["']/.test(crypto)) {
  fail("plaid-token-crypto.ts must reuse lib/encryption.js (import { encrypt, decrypt })");
}
if (/createCipheriv|createDecipheriv/.test(crypto)) {
  fail("plaid-token-crypto.ts must NOT implement its own cipher — reuse lib/encryption.js");
}
for (const fn of ["encryptPlaidAccessToken", "decryptPlaidAccessToken"]) {
  if (!new RegExp(`export function ${fn}`).test(crypto)) fail(`plaid-token-crypto.ts must export ${fn}`);
}
// Backward-compatible legacy plaintext read must be documented/handled.
if (!/access-/.test(crypto)) {
  fail("plaid-token-crypto.ts must handle legacy plaintext tokens (access- prefix)");
}

// 2) WRITE path: token is encrypted before persistence.
if (!/const accessTokenEncrypted = encryptPlaidAccessToken\(accessToken\)/.test(service)) {
  fail("plaid.service.ts must encrypt the exchanged token via encryptPlaidAccessToken(accessToken)");
}
// Both persistence value arrays must bind the ENCRYPTED value, in the token slot.
const updateBind = /itemId,\s*\n\s*accessTokenEncrypted,\s*\n\s*institutionName,/;
const insertBind = /itemId,\s*\n\s*accessTokenEncrypted,\s*\n\s*account\.account_id,/;
if (!updateBind.test(service)) fail("plaid.service.ts UPDATE must bind accessTokenEncrypted (not raw token)");
if (!insertBind.test(service)) fail("plaid.service.ts INSERT must bind accessTokenEncrypted (not raw token)");

// 2b) NEGATIVE: the raw plaintext token must NOT be bound into the persistence value arrays.
if (/accessToken,\s*\n\s*institutionName,/.test(service)) {
  fail("plaid.service.ts UPDATE binds RAW accessToken — must be encrypted");
}
if (/accessToken,\s*\n\s*account\.account_id,/.test(service)) {
  fail("plaid.service.ts INSERT binds RAW accessToken — must be encrypted");
}

// 3) READ path: every consumer decrypts (backward-compatible).
for (const [label, src] of [
  ["plaid.service.ts", service],
  ["link.routes.ts", linkRoutes],
  ["plaid-items.routes.ts", itemsRoutes],
]) {
  if (!/decryptPlaidAccessToken/.test(src)) {
    fail(`${label} reads plaid_access_token but never calls decryptPlaidAccessToken`);
  }
}
// NEGATIVE: no raw token pulled straight out of a row and used undecrypted.
if (/=\s*tokenRes\.rows\[0\]\?\.plaid_access_token\s*\?\?\s*null;/.test(linkRoutes)) {
  fail("link.routes.ts uses raw plaid_access_token without decryptPlaidAccessToken");
}
if (/const token = accessRes\.rows\[0\]\?\.token \?\? null;/.test(itemsRoutes)) {
  fail("plaid-items.routes.ts uses raw token without decryptPlaidAccessToken");
}
if (/const plaidAccessToken = account\.plaid_access_token;/.test(service)) {
  fail("plaid.service.ts getAccountBalance uses raw plaid_access_token without decrypt");
}

console.log(`${NAME} PASS`);

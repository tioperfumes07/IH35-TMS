#!/usr/bin/env node
// Guard: the Samsara HOS readiness endpoint must NEVER expose a token value. It may report token
// PRESENCE as a boolean only. This locks: token columns are read solely inside an `IS NOT NULL`
// boolean, the response carries `token_present` (not a token value), and env tokens are used only for
// a presence boolean — so a future edit can't turn this read-only diagnostic into a secret leak.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-samsara-hos-readiness-no-secret: ${m}`); process.exit(1); };
const src = readFileSync(join(root, "apps/backend/src/integrations/samsara/hos-readiness.routes.ts"), "utf8");

// Response must expose presence as a boolean, never a token value.
if (!/token_present:/.test(src)) fail("response must include token_present boolean");
for (const banned of [/\btoken:\s/, /api_token:/, /encrypted_api_token:/, /access_token:/]) {
  if (banned.test(src)) fail(`response must not include a token value field (${banned})`);
}

// Token columns may appear ONLY inside an IS NOT NULL boolean expression — never selected raw.
const tokenColRefs = src.match(/(encrypted_api_token|api_token_encrypted)/g) ?? [];
if (tokenColRefs.length > 0) {
  // Every occurrence must be part of "<col> IS NOT NULL".
  const okPattern = /(encrypted_api_token|api_token_encrypted)\s+IS NOT NULL/g;
  const okCount = (src.match(okPattern) ?? []).length;
  if (okCount !== tokenColRefs.length) {
    fail("token bytea columns may only be referenced inside `IS NOT NULL` (presence), never selected raw");
  }
}

// Env tokens used for presence boolean only — never returned/logged.
if (/return[^\n]*SAMSARA_API_TOKEN/.test(src)) fail("must not return the env token value");
if (!/Boolean\(\s*\n?\s*process\.env\.SAMSARA_API_TOKEN/.test(src)) {
  // tolerate formatting: just require env token appears inside a Boolean() presence check
  if (!/Boolean\([\s\S]*SAMSARA_API_TOKEN/.test(src)) fail("env token must be reduced to a presence boolean");
}

// The 3 gates + diagnostics must all be present in the response.
for (const field of ["is_enabled:", "mapped_driver_count:", "unmapped_driver_count:", "last_pull:", "operating_company_id:"]) {
  if (!src.includes(field)) fail(`response must include ${field}`);
}

console.log("PASS verify-samsara-hos-readiness-no-secret");

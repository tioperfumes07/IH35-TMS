#!/usr/bin/env node
/**
 * verify-vendor-credits-vendor-id-safe-cast.mjs
 *
 * ACCT-F5405 — accounting.vendor_credits.vendor_id is TEXT (it holds an mdata.vendors uuid, per the
 * app's own picker), while mdata.vendors.id is UUID. Postgres has no `uuid = text` operator at all, so
 * the naive join `v.id = vc.vendor_id` in the GET list and GET detail routes made
 * `/accounting/vendor-credits` a 500 on every real call — confirmed live (browser showed
 * "Couldn't load vendor credits — Error: operator does not exist: uuid = text") and reproduced/fixed
 * directly against Neon prod schema.
 *
 * apps/backend/src/accounting/vendor-identity.ts already documents the correct rule for this exact
 * identity-space collision: "compare as text — never cast the caller value to uuid, because a QBO id
 * ('472') would make the cast RAISE instead of simply not matching." The fix here follows that same
 * rule: cast the always-valid uuid column (`v.id::text`), never the arbitrary text column.
 *
 * Guards against regressing back to the bare, type-mismatched join.
 */
import { readFileSync } from "node:fs";

const path = "apps/backend/src/accounting/vendor-credits.routes.ts";
const src = readFileSync(path, "utf8");

const failures = [];

// The two SELECT queries that join mdata.vendors must cast v.id to text, never leave it bare.
const joinLines = [...src.matchAll(/LEFT JOIN mdata\.vendors v\s*\n\s*ON\s+(\S+)\s*=\s*vc\.vendor_id/g)];
if (joinLines.length === 0) {
  failures.push("expected at least one 'LEFT JOIN mdata.vendors v ON ... = vc.vendor_id' join — query shape changed, re-check this guard");
}
for (const m of joinLines) {
  const leftSide = m[1];
  if (leftSide !== "v.id::text") {
    failures.push(
      `join predicate uses '${leftSide} = vc.vendor_id' — must be 'v.id::text = vc.vendor_id' ` +
      `(vc.vendor_id is TEXT, v.id is UUID; Postgres has no uuid = text operator — this 500s live)`
    );
  }
}

// Never cast the vendor_id text column itself to uuid — a QBO-keyed id ('472') would RAISE, not miss.
if (/vc\.vendor_id::uuid/.test(src)) {
  failures.push("found 'vc.vendor_id::uuid' — never cast the vendor_id text column to uuid, cast v.id to text instead (see vendor-identity.ts header comment)");
}

if (failures.length > 0) {
  console.error("verify-vendor-credits-vendor-id-safe-cast: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-vendor-credits-vendor-id-safe-cast: OK — mdata.vendors join casts v.id::text (never vc.vendor_id::uuid)");

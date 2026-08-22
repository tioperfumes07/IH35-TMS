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

// JOIN must never cast vendor_id to uuid (QBO id '472' would RAISE). The deactivated-vendor
// resolver may regex-gate a uuid-shaped vendor_id then ::uuid — that is not a join predicate.
if (/LEFT JOIN mdata\.vendors[\s\S]{0,120}vc\.vendor_id::uuid/.test(src)) {
  failures.push("join still casts vc.vendor_id::uuid — must compare v.id::text = vc.vendor_id");
}
const joinStripped = src.replace(/mdata\.resolve_vendor_label_same_company\([\s\S]*?vc\.operating_company_id\s*\)/g, "RESOLVER()");
if (/vc\.vendor_id::uuid/.test(joinStripped)) {
  failures.push("found 'vc.vendor_id::uuid' outside resolve_vendor_label_same_company — never cast the text column on the join");
}
if (
  /vc\.vendor_id::uuid/.test(src) &&
  !/vc\.vendor_id ~ '\^\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{12\}\$'/.test(src)
) {
  failures.push("vc.vendor_id::uuid in resolver must be gated on a uuid-shaped regex so QBO text ids cannot RAISE");
}

if (failures.length > 0) {
  console.error("verify-vendor-credits-vendor-id-safe-cast: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-vendor-credits-vendor-id-safe-cast: OK — mdata.vendors join casts v.id::text (never vc.vendor_id::uuid)");

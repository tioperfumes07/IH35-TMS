#!/usr/bin/env node
/**
 * C2-4 regression guard — bypass PII reads of mdata.drivers by PK must be OCI-scoped.
 *
 * Two RLS-bypassing (`withLuciaBypass`) reads fetch driver PII (name/phone/email)
 * keyed only by `id = $1`. Because the read runs under a bypass client, RLS does
 * NOT scope by operating_company_id, so a driverId belonging to another operating
 * company would be read cross-entity (PII leak; USMCA-launch blocker class). The
 * fix adds `AND [d.]operating_company_id = $N` to each read.
 *
 * This static check (no DB connection) asserts that any SQL template in the two
 * known files that SELECTs driver PII columns from mdata.drivers also filters by
 * operating_company_id. Exit 0 = scoped (pass). Exit 1 = an unscoped read regressed.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:driver-bypass-pk-opco-scope";

// Files that contain the guarded bypass PII reads.
const TARGETS = [
  "apps/backend/src/services/push-notification.service.ts",
  "apps/backend/src/driver-finance/settlement-disputes-p6.service.ts",
];

// PII columns that mark a driver read as a privacy-sensitive fetch (as opposed to
// a bare existence / non-PII token check).
const PII_RE = /\b(first_name|last_name|phone|email)\b/;

const offenders = [];

for (const rel of TARGETS) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    offenders.push(`${rel} — file missing (guard target moved; update this guard)`);
    continue;
  }
  const content = fs.readFileSync(full, "utf8");

  // Extract every backtick template literal and inspect the ones that read driver PII.
  const templates = content.match(/`[^`]*`/gs) ?? [];
  let sawGuardedRead = false;
  for (const tpl of templates) {
    const sql = tpl.toLowerCase();
    if (!sql.includes("from mdata.drivers")) continue;
    if (!PII_RE.test(sql)) continue; // only PII reads are in scope for this guard
    sawGuardedRead = true;
    if (!sql.includes("operating_company_id")) {
      offenders.push(`${rel} — driver PII read from mdata.drivers lacks operating_company_id predicate`);
    }
  }
  if (!sawGuardedRead) {
    offenders.push(`${rel} — expected a driver PII read from mdata.drivers but found none (guard may be stale)`);
  }
}

if (offenders.length > 0) {
  console.error(`${LABEL} FAIL`);
  for (const o of offenders) console.error(`- ${o}`);
  process.exit(1);
}

console.log(`${LABEL} PASS (${TARGETS.length} files checked)`);
process.exit(0);

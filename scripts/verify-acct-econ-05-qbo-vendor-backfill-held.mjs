#!/usr/bin/env node
/**
 * ACCT-ECON-05 / ACCT-F82 — FORWARD invariant for the QBO vendor mirror.
 *
 * WHAT CHANGED AND WHY. This guard used to assert that the 202610121800 backfill migration
 * `INSERT INTO`s the canonical mirror. When ACCT-ECON-05 was written, "canonical" meant
 * `accounting.qbo_vendors`. The owner has since ruled — and doc 05-LINKAGE-LAW confirms — that
 * **`mdata.qbo_*` is canonical and `accounting.qbo_*` is RETIRE**. That inverts the old assertion.
 *
 * The old assertion cannot simply be reversed: 202610121800 is an APPLIED, CHECKSUM-FROZEN migration
 * (sha256 c3c14c527dbecfa4…). It wrote `accounting.qbo_vendors` and always will; editing it would break
 * its checksum. Demanding it write canonical would be an assertion no code could ever satisfy — and a
 * guard that is permanently red is not a control, it is noise that teaches people to ignore red.
 *
 * So the historical assertion is RETIRED and replaced by the invariant that actually protects the
 * system going forward:
 *
 *   1. The LIVE inbound puller writes the CANONICAL mirror `mdata.qbo_vendors`, and does NOT write the
 *      RETIRE mirror. This is the thing that must never regress — it is why vendors_pull could never
 *      succeed: ON CONFLICT (operating_company_id, qbo_id) has no matching unique index on the retire
 *      table, while the canonical one carries qbo_vendors_operating_company_id_qbo_id_key.
 *   2. The frozen migration stays REGISTERED and never DROPs. Its historical write to the retire table
 *      is grandfathered by exact key+count in scripts/.canonical-write-exempt.json, so a NEW retire
 *      write anywhere — including one more line in that same file — still fails CI (mutation-proven).
 *
 * NOT ASSERTED HERE, DELIBERATELY: that the 2,782 rows already in `accounting.qbo_vendors` have been
 * reconciled and archived. That is RUNTIME DATA STATE, not a property of any file, and a static guard
 * claiming to verify it would be theatre. It is a live-verify item (reconcile-then-archive, never drop)
 * and belongs in the money 3-gate proof, not in a grep.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202610121800_acct_econ_05_qbo_vendors_canonical_backfill.sql";
const HELD = "db/migrations/.held-migrations.json";
const PULLER = "apps/backend/src/qbo-sync/vendors-puller.ts";
const LABEL = "verify-acct-econ-05-qbo-vendor-backfill-held";

/** Invariant 1 — the live puller writes canonical, never the retire mirror. */
export function auditPuller(src) {
  const problems = [];
  if (/INSERT\s+INTO\s+accounting\.qbo_vendors/i.test(src)) {
    problems.push(
      `${PULLER}: inbound pull INSERTs into RETIRE accounting.qbo_vendors. That table has no unique index on ` +
        `(operating_company_id, qbo_id), so its ON CONFLICT cannot resolve and vendors_pull aborts — the exact ` +
        `reason the step had never once succeeded. Write canonical mdata.qbo_vendors.`
    );
  }
  if (!/INSERT\s+INTO\s+mdata\.qbo_vendors/i.test(src)) {
    problems.push(`${PULLER}: inbound pull must INSERT into canonical mdata.qbo_vendors (LINKAGE LAW: mdata.qbo_* is canonical).`);
  }
  return problems;
}

/** Invariant 2 — the frozen migration stays registered and never DROPs. */
export function auditMigration(mig, held) {
  const problems = [];
  if (!/HOLD-FOR-JORGE/i.test(mig)) problems.push("mig missing HOLD-FOR-JORGE");
  if (/DROP TABLE/i.test(mig)) problems.push("mig must never DROP");
  const inHeld = (held.held || []).some((e) => e.file === path.basename(MIG));
  if (!inHeld) problems.push("mig not in held[]");
  return problems;
}

const realPuller = () => fs.readFileSync(path.join(ROOT, PULLER), "utf8");
const realMig = () => fs.readFileSync(path.join(ROOT, MIG), "utf8");
const realHeld = () => JSON.parse(fs.readFileSync(path.join(ROOT, HELD), "utf8"));

function mutate(src, from, to, label) {
  const out = src.replace(from, to);
  if (out === src) {
    throw new Error(
      `mutation "${label}" did not apply — the fixture no longer matches ${PULLER}. The negative case is ` +
        `UNTESTED; fix the fixture rather than trusting this guard.`
    );
  }
  return out;
}

function selftest() {
  const failures = [];
  const puller = realPuller();

  if (auditPuller(puller).length !== 0) failures.push(`case0a FAIL — real puller flagged: ${auditPuller(puller).join(" | ")}`);
  const m0 = auditMigration(realMig(), realHeld());
  if (m0.length !== 0) failures.push(`case0b FAIL — real migration flagged: ${m0.join(" | ")}`);

  // NEGATIVE — puller regressed onto the RETIRE mirror (the ACCT-F82 defect itself).
  try {
    const retired = mutate(puller, "INSERT INTO mdata.qbo_vendors", "INSERT INTO accounting.qbo_vendors", "repoint puller back to retire");
    const p = auditPuller(retired);
    if (!p.some((x) => /RETIRE accounting\.qbo_vendors/.test(x))) failures.push("FAIL — puller writing the RETIRE mirror was NOT caught");
    if (!p.some((x) => /must INSERT into canonical/.test(x))) failures.push("FAIL — missing canonical INSERT was NOT caught");
  } catch (err) {
    failures.push(`FAIL — puller mutation: ${err.message}`);
  }

  // NEGATIVE — a DROP sneaking into the frozen migration.
  if (!auditMigration(realMig() + "\nDROP TABLE accounting.qbo_vendors;\n", realHeld()).some((x) => /never DROP/.test(x))) {
    failures.push("FAIL — DROP TABLE in the migration was NOT caught");
  }
  // NEGATIVE — de-registering the migration.
  if (!auditMigration(realMig(), { held: [] }).some((x) => /not in held/.test(x))) {
    failures.push("FAIL — unregistered migration was NOT caught");
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — real sources clean; puller-on-retire, missing-canonical-INSERT, DROP and ` +
      `de-registration all rejected. Every mutation verified to have applied.`
  );
}

function main() {
  const problems = [...auditPuller(realPuller()), ...auditMigration(realMig(), realHeld())];
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — inbound pull writes canonical mdata.qbo_vendors; the frozen backfill stays held, registered, and never drops.`);
}

if (process.argv.includes("--selftest")) selftest();
else main();

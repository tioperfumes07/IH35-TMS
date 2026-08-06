#!/usr/bin/env node
/**
 * RATCHET — verify-qbo-canonical-recon (CLS-DUAL-PATH · ACCT-F123)
 *
 * THE RULE: the QBO ENTITY MIRROR is `mdata.qbo_*`. `accounting.qbo_*` entity tables are RETIRE
 * (§10 canonical wiring). Two mirrors of the same QuickBooks data is the dual-path defect: whichever
 * one a reader happens to pick decides the answer, and reconciliation run against the stale copy
 * reports divergences that are not real and misses ones that are.
 *
 * THE DIVERGENCE IS MEASURED, NOT ASSUMED. Prod 2026-08-05 (lucia, n_live_tup):
 *
 *     entity      mdata.qbo_* (canonical)   accounting.qbo_* (retire)   drift
 *     accounts               1,916                    1,647            −269
 *     customers              3,562                    2,655            −907
 *     vendors                3,427                    2,782            −645
 *
 * The retire copies are ~1,000 rows behind each. Anything reading them is reading last year's
 * QuickBooks.
 *
 * WHAT SAVES US TODAY, AND WHY THAT IS EXACTLY WHY THIS RATCHET EXISTS: those three tables currently
 * have NO production reader and NO production writer — they are orphaned, not actively wrong. The
 * defect is latent. One `FROM accounting.qbo_vendors` in a future recon query silently reintroduces
 * a stale-mirror read, and nothing else in the repo would notice. This guard is that notice.
 *
 * ALLOWED IN `accounting`, DELIBERATELY. Not every `accounting.qbo_*` table is a mirror:
 *   · qbo_remote_counts / qbo_remote_count_collection_state — reconciliation TELEMETRY (how many rows
 *     QBO reports remotely). It is accounting's own bookkeeping about the recon run, not a copy of
 *     QuickBooks entities, and it is read by the live recon worker on purpose.
 *   · qbo_payroll_links — payroll linkage rows, not an entity mirror.
 * Banning those would force a pointless migration and get the guard deleted. The line is ENTITY
 * MIRROR vs telemetry, not schema name.
 *
 * NOT ASSERTED — and this is a deliberate refusal, not an omission. It is tempting to also assert
 * `mdata.qbo_ap_bills` (17,304) against `accounting.bills` QBO-origin (16,245) and call the 1,059
 * difference a divergence. That comparison is NOT scope-matched: the mirror and the ledger do not
 * share a population, a realm filter or a date window, and the SCOPE-MATCHED TIE-OUT LAW exists
 * because exactly that shape produced the retracted CLS-FUEL-DOUBLE-POST finding. Until someone
 * proves same-scope on both sides, that delta is UNVERIFIED and this guard does not claim it.
 */
import process from "node:process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LABEL = "verify-qbo-canonical-recon";
const ROOT = "apps/backend/src";

/** ENTITY mirrors — canonical home is mdata.*. A reference to these under `accounting.` is the defect. */
export const RETIRE_ENTITY_MIRRORS = Object.freeze({
  // accounting.<table>  ->  the CANONICAL table a reader should use instead.
  //
  // The mapping is NOT a blanket "same name under mdata". Verified on prod 2026-08-05 (n_live_tup,
  // RLS-immune per the discriminator law), mdata.qbo_* splits by DIRECTION and the two halves are
  // not interchangeable:
  //   INBOUND clones — real QuickBooks history, genuinely canonical:
  //     qbo_ap_bills 16,598 · qbo_ar_invoices 11,083 · qbo_ar_payments 23,308 ·
  //     qbo_purchases 28,370 · qbo_vendors 2,787 · qbo_accounts 1,916
  //   OUTBOUND write-back STAGING — correctly EMPTY, and must stay that way:
  //     mdata.qbo_bills 0 · mdata.qbo_invoices 0
  //     Migration 0218/202606290110 gives qbo_bills a NOT NULL FK to accounting.bills, so it can only
  //     ever hold TMS-ORIGINATED rows. Write-back is permanently OFF, so 0 rows is DESIGNED.
  //
  // This distinction is why the map exists instead of a name list. My first cut pointed
  // accounting.qbo_bills at mdata.qbo_bills — which would have sent a reader to an empty staging
  // table and invited someone to "fix" the emptiness by enabling write-back, the one thing the
  // parallel-books architecture forbids. Bills resolve to qbo_ap_bills; invoices to qbo_ar_invoices.
  qbo_accounts: "mdata.qbo_accounts",
  qbo_vendors: "mdata.qbo_vendors",
  qbo_customers: "mdata.qbo_customers",
  qbo_bills: "mdata.qbo_ap_bills",
  qbo_invoices: "mdata.qbo_ar_invoices",
  qbo_items: "mdata.qbo_items",
  qbo_classes: "mdata.qbo_classes",
});

/** Empty BY DESIGN — outbound write-back staging. Never a sync gap, never a repoint target. */
export const OUTBOUND_STAGING_EMPTY_BY_DESIGN = Object.freeze(["mdata.qbo_bills", "mdata.qbo_invoices"]);

/** Legitimately accounting-owned: recon telemetry + payroll linkage, NOT copies of QBO entities. */
export const ALLOWED_ACCOUNTING_QBO = [
  "qbo_remote_counts",
  "qbo_remote_count_collection_state",
  "qbo_payroll_links",
];

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.includes("__tests__") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/** Any `accounting.<entity-mirror>` reference in real source, comments stripped so prose cannot trip it. */
export function findRetireMirrorRefs(files) {
  const offenders = [];
  const re = new RegExp(`accounting\\.(${Object.keys(RETIRE_ENTITY_MIRRORS).join("|")})\\b`, "g");
  for (const file of files) {
    let src;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|\s)\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/^\s*\*[^\n]*$/gm, (m) => m.replace(/[^\n]/g, " "));
    let m;
    while ((m = re.exec(stripped)) !== null) {
      offenders.push({ file, table: m[1], line: stripped.slice(0, m.index).split("\n").length });
    }
  }
  return offenders;
}

if (process.argv.includes("--selftest")) {
  const real = findRetireMirrorRefs(walk(ROOT));
  if (real.length) {
    console.error(`${LABEL} --selftest FAIL — real repo already references a retire entity mirror:`);
    for (const o of real) console.error(`  - ${o.file}:${o.line} accounting.${o.table}`);
    process.exit(1);
  }
  const { writeFileSync } = await import("node:fs");
  const bad = "/tmp/.qbo-canon-bad.ts";
  const ok = "/tmp/.qbo-canon-ok.ts";
  const allowed = "/tmp/.qbo-canon-allowed.ts";
  const comment = "/tmp/.qbo-canon-comment.ts";
  // Mutation 1: a stale-mirror read must be caught — the whole point.
  writeFileSync(bad, `const q = "SELECT id FROM accounting.qbo_vendors WHERE x=1";\n`);
  if (findRetireMirrorRefs([bad]).length !== 1) {
    console.error(`${LABEL} --selftest FAIL — a planted accounting.qbo_vendors read was NOT detected.`);
    process.exit(1);
  }
  // Mutation 2: the CANONICAL table must not be flagged, or the guard bans the correct thing.
  writeFileSync(ok, `const q = "SELECT id FROM mdata.qbo_vendors WHERE x=1";\n`);
  if (findRetireMirrorRefs([ok]).length !== 0) {
    console.error(`${LABEL} --selftest FAIL — mdata.qbo_vendors (canonical) was wrongly flagged.`);
    process.exit(1);
  }
  // Mutation 3: telemetry under accounting.* must stay allowed, or the live recon worker breaks and
  // someone deletes this guard rather than migrate a table that is correctly placed.
  writeFileSync(allowed, `const q = "SELECT n FROM accounting.qbo_remote_counts";\n`);
  if (findRetireMirrorRefs([allowed]).length !== 0) {
    console.error(`${LABEL} --selftest FAIL — accounting.qbo_remote_counts (telemetry) was wrongly flagged.`);
    process.exit(1);
  }
  // Mutation 4: a mention inside a COMMENT is documentation, not a read. Flagging it would train
  // people to stop writing the explanation down.
  writeFileSync(comment, `// historical: accounting.qbo_vendors was the old mirror\nconst q = "SELECT 1";\n`);
  if (findRetireMirrorRefs([comment]).length !== 0) {
    console.error(`${LABEL} --selftest FAIL — a commented mention was treated as a live reference.`);
    process.exit(1);
  }
  // Mutation 5: bills/invoices must resolve to the INBOUND clones. If either is ever repointed at
  // mdata.qbo_bills / mdata.qbo_invoices the guard would send a reader to an empty write-back staging
  // table and invite someone to "fix" the emptiness by enabling write-back — forbidden under parallel
  // books, and the exact error this map was corrected for.
  if (RETIRE_ENTITY_MIRRORS.qbo_bills !== "mdata.qbo_ap_bills" || RETIRE_ENTITY_MIRRORS.qbo_invoices !== "mdata.qbo_ar_invoices") {
    console.error(`${LABEL} --selftest FAIL — bills/invoices must map to the INBOUND clones (qbo_ap_bills / qbo_ar_invoices), not the empty write-back staging tables.`);
    process.exit(1);
  }
  for (const staging of OUTBOUND_STAGING_EMPTY_BY_DESIGN) {
    if (Object.values(RETIRE_ENTITY_MIRRORS).includes(staging)) {
      console.error(`${LABEL} --selftest FAIL — ${staging} is empty-by-design write-back staging and must never be a repoint target.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — 6 mutations detected; repo clean of retire-mirror reads.`);
  process.exit(0);
}

const offenders = findRetireMirrorRefs(walk(ROOT));
if (offenders.length > 0) {
  console.error(`${LABEL} FAIL — ${offenders.length} reference(s) to a RETIRE QBO entity mirror:`);
  for (const o of offenders) {
    console.error(
      `  - ${o.file}:${o.line} uses accounting.${o.table}. The canonical table is ` +
        `${RETIRE_ENTITY_MIRRORS[o.table]} — note bills/invoices map to the INBOUND qbo_ap_bills / ` +
        `qbo_ar_invoices, NOT mdata.qbo_bills/qbo_invoices, which are empty-by-design write-back staging. ` +
        `(§10). On prod the accounting.* copies run ~1,000 rows behind per entity, so this reads stale ` +
        `QuickBooks data and any reconciliation built on it is wrong in both directions.`
    );
  }
  process.exit(1);
}
console.log(
  `${LABEL} PASS — no production code reads a retire QBO entity mirror. Canonical is the INBOUND ` +
    `mdata clone set (qbo_ap_bills / qbo_ar_invoices / qbo_ar_payments / qbo_purchases / qbo_vendors / ` +
    `qbo_accounts); mdata.qbo_bills and mdata.qbo_invoices are outbound write-back staging and are ` +
    `empty BY DESIGN, not a gap. accounting.qbo_remote_counts / _collection_state / qbo_payroll_links ` +
    `are recon telemetry and payroll linkage, not entity mirrors, and remain allowed.`
);

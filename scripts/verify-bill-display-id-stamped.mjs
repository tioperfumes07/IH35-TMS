#!/usr/bin/env node
/**
 * GUARD: creating a TMS-native bill must stamp a human-readable display_id.
 *
 * ACCT-F186 (board card LV-BILL-NO-DISPLAY-ID). Measured on prod with the ORIGIN TEST applied,
 * because the raw count would be meaningless: `display_id` is NULL on all 16,258 rows, but 16,245
 * of those are QBO clones whose NULL is EXPECTED STATE under parallel books. Classified by origin,
 * the real finding is stark —
 *
 *     TMS-native bills with a display_id:     0 of 13   (every entity)
 *     TMS-native invoices with a display_id:  6 of 6
 *     TMS-native payments with a display_id:  2 of 2
 *
 * Bills were the ONLY money document in the system without a human-readable identifier. A bill is
 * what you argue about with a vendor, attach to an approval, cite in a dispute and hand an auditor;
 * without one it can be cited only by raw UUID — which is exactly what the app URL falls back to
 * (/accounting/bills/7ccd431e-…).
 *
 * WHAT THIS ASSERTS, and why each clause is here rather than a general "has a display_id" check:
 *   1. createBill actually calls the generator — the whole defect was that nothing did.
 *   2. The stamp is scoped to TMS-native rows (`qbo_bill_id IS NULL`). Stamping a QBO clone would
 *      invent an identifier for a document this system never issued, and would be a parallel-books
 *      violation, not a fix.
 *   3. The stamp is entity-scoped. display_id is unique PER ENTITY, never globally — INV-2026-00004
 *      already exists on two entities at once.
 *   4. The generator takes an advisory lock. Without it two concurrent creates race to the same
 *      number, which is how a duplicate human id reaches an auditor.
 *
 * Run:  node scripts/verify-bill-display-id-stamped.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/accounting/bills.service.ts";
const GENERATOR = "apps/backend/src/accounting/display-id.ts";
const LABEL = "verify-bill-display-id-stamped";

const read = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

/** Strip comments: every fix in this class ships with a comment naming the very tokens checked. */
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

export function collectProblems(svc, gen) {
  const problems = [];
  if (svc == null) return [`missing ${SERVICE}`];
  if (gen == null) return [`missing ${GENERATOR}`];
  const s = strip(svc);
  const g = strip(gen);

  if (!/export async function nextBillDisplayId/.test(g)) {
    problems.push(`${GENERATOR} must export nextBillDisplayId — bills need their own series (BILL-YYYY-NNNNN).`);
  } else {
    const body = /export async function nextBillDisplayId[\s\S]{0,1600}?\n}/.exec(g)?.[0] ?? "";
    if (!/withDisplayLock/.test(body)) {
      problems.push(
        `${GENERATOR} nextBillDisplayId takes no advisory lock. Two concurrent bill creates would race ` +
          `to the same number, putting a DUPLICATE human identifier in front of an auditor.`
      );
    }
    if (!/operating_company_id\s*=/.test(body)) {
      problems.push(
        `${GENERATOR} nextBillDisplayId is not entity-scoped. display_id is unique PER ENTITY, not ` +
          `globally — INV-2026-00004 already exists on two entities at once.`
      );
    }
  }

  if (!/nextBillDisplayId\s*\(/.test(s)) {
    problems.push(
      `${SERVICE} never calls nextBillDisplayId, so a created bill keeps display_id NULL and can only ` +
        `be cited by raw UUID (ACCT-F186). Bills were the ONLY money document without one.`
    );
    return problems;
  }

  const stamp = /UPDATE\s+accounting\.bills[\s\S]{0,700}?display_id\s*=[\s\S]{0,700}?RETURNING/i.exec(s)?.[0] ?? "";
  if (!stamp) {
    problems.push(`${SERVICE} calls the generator but no UPDATE assigns display_id on accounting.bills.`);
    return problems;
  }
  if (!/qbo_bill_id\s+IS\s+NULL/i.test(stamp)) {
    problems.push(
      `${SERVICE} display_id stamp is not restricted to TMS-native rows (qbo_bill_id IS NULL). ` +
        `Stamping a QBO clone invents an identifier for a document this system never issued — a ` +
        `parallel-books violation, not a fix.`
    );
  }
  if (!/operating_company_id\s*=/i.test(stamp)) {
    problems.push(`${SERVICE} display_id stamp is not entity-scoped.`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const svc = read(SERVICE);
  const gen = read(GENERATOR);
  const baseline = collectProblems(svc, gen);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree is not green:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  // Every mutation runs through the REAL checker and must come back RED. Four guards found on
  // 2026-08-08 had selftests that could not fail — one regex-tested a string it had just built,
  // another asserted a string contains itself. Both patterns are avoided here on purpose.
  const mutations = [
    ["generator removed", svc, gen.replace("export async function nextBillDisplayId", "async function unusedBillDisplayId")],
    ["createBill stops calling it (the ACCT-F186 defect verbatim)", svc.replaceAll("nextBillDisplayId", "unusedFn"), gen],
    ["stamp no longer TMS-native-only", svc.replace(/\s*AND qbo_bill_id IS NULL/, ""), gen],
    ["stamp loses entity scope", svc.replace(/\s*AND operating_company_id = \$2::uuid/, ""), gen],
    ["generator loses its advisory lock", svc, gen.replace(/await withDisplayLock\(client, `accounting\.bill\.display_id[^`]*`\);/, "")],
  ];
  const inert = [];
  for (const [why, s, g] of mutations) {
    if (s === svc && g === gen) {
      inert.push(`${why} — MUTATION INERT (changed nothing; proves nothing)`);
      continue;
    }
    if (collectProblems(s, g).length === 0) inert.push(`${why} — NOT DETECTED`);
  }
  if (inert.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of inert) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

const problems = collectProblems(read(SERVICE), read(GENERATOR));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — createBill stamps a locked, entity-scoped, TMS-native-only display_id, so bills are ` +
    `no longer the only money document citable solely by UUID.`
);

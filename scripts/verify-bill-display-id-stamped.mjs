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
 *   5. LST-F412 — createBill was the ONLY writer that stamped. Six others (bank bulk categorize,
 *      bank-line splits, maintenance poster, two-section WO, insurance policy, recurring) inserted
 *      accounting.bills with display_id NULL. Migration 202615430100 makes the database the one
 *      writer of the id for every path: trg_assign_bill_display_id BEFORE INSERT, TMS-native only,
 *      the SAME advisory-lock key as nextBillDisplayId, entity-scoped MAX+1.
 *   6. --live: no TMS-native bill created on or after the trigger's cutover has display_id NULL.
 *      (The two older NULL rows are in frozen TRANSP / TRK; ACCT-F406 — no data corrections.)
 *
 * Run:  node scripts/verify-bill-display-id-stamped.mjs [--selftest] [--live]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/accounting/bills.service.ts";
const GENERATOR = "apps/backend/src/accounting/display-id.ts";
const MIGRATION = "db/migrations/202615430100_bills_display_id_assigned_at_insert.sql";
const CUTOVER = "2026-10-06";
const LABEL = "verify-bill-display-id-stamped";

const read = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

/** Strip comments: every fix in this class ships with a comment naming the very tokens checked. */
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

/** LST-F412 — the BEFORE INSERT trigger every bill writer goes through. */
export function collectTriggerProblems(mig) {
  if (mig == null) return [`missing ${MIGRATION} — only createBill stamps display_id; every other bill writer leaves it NULL (LST-F412).`];
  const m = strip(mig);
  const problems = [];
  if (!/CREATE\s+TRIGGER\s+trg_assign_bill_display_id\s+BEFORE\s+INSERT\s+ON\s+accounting\.bills/i.test(m)) {
    problems.push(`${MIGRATION} does not create trg_assign_bill_display_id BEFORE INSERT ON accounting.bills.`);
  }
  if (!/NEW\.qbo_bill_id\s+IS\s+NOT\s+NULL/i.test(m)) {
    problems.push(`${MIGRATION} stamps QBO clones too — a QBO bill keeps its QBO identity (parallel books).`);
  }
  if (!/NEW\.display_id\s+IS\s+NOT\s+NULL/i.test(m)) {
    problems.push(`${MIGRATION} overwrites a display_id the writer supplied (an operator-typed bill number).`);
  }
  if (!/pg_advisory_xact_lock\(hashtext\('accounting\.bill\.display_id:'\s*\|\|\s*NEW\.operating_company_id/i.test(m)) {
    problems.push(
      `${MIGRATION} does not take nextBillDisplayId's advisory lock key — the trigger and the TS generator ` +
        `would race to the same BILL number.`
    );
  }
  if (!/b\.operating_company_id\s*=\s*NEW\.operating_company_id/i.test(m)) {
    problems.push(`${MIGRATION} MAX+1 is not entity-scoped — display_id is unique PER ENTITY.`);
  }
  if (!/'BILL-'/.test(m)) problems.push(`${MIGRATION} does not issue the BILL-YYYY-NNNNN series.`);
  return problems;
}

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

  if (!/(?:nextBillDisplayId|resolveBillDisplayId)\s*\(/.test(s)) {
    problems.push(
      `${SERVICE} never calls nextBillDisplayId / resolveBillDisplayId, so a created bill keeps display_id NULL and can only ` +
        `be cited by raw UUID (ACCT-F186). Bills were the ONLY money document without one.`
    );
    return problems;
  }

  // Anchored on "SET display_id =" directly (not just "display_id" appearing anywhere within 700
  // chars) — bills.service.ts has an EARLIER, unrelated `UPDATE accounting.bills SET
  // legal_matter_id = …` statement whose 700-char lookahead window reaches far enough to swallow
  // the real display_id stamp statement below it, producing a garbled multi-statement blob. Found
  // live: the mutation-anchor bug below only surfaced because this extraction was already loose.
  const stamp = /UPDATE\s+accounting\.bills[\s\S]{0,80}?SET\s+display_id\s*=[\s\S]{0,700}?RETURNING/i.exec(s)?.[0] ?? "";
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
  const mig = read(MIGRATION);
  const baseline = [...collectProblems(svc, gen), ...collectTriggerProblems(mig)];
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
    [
      "createBill stops calling it (the ACCT-F186 defect verbatim)",
      svc.replaceAll("nextBillDisplayId", "unusedFn").replaceAll("resolveBillDisplayId", "unusedFn"),
      gen,
    ],
    ["stamp no longer TMS-native-only", svc.replace(/\s*AND qbo_bill_id IS NULL/, ""), gen],
    // Anchored with a lookahead requiring proximity to "qbo_bill_id IS NULL" — a phrase unique to
    // the real display_id stamp statement. Unanchored, this hit the FIRST
    // "AND operating_company_id = $2::uuid" in the whole file, an unrelated
    // banking.bank_accounts balance UPDATE ~29KB earlier — found live: the mutation reported
    // "changed something" but the real defect (display_id stamp losing entity scope) was never
    // planted, so collectProblems() correctly stayed green and this selftest case was inert.
    [
      "stamp loses entity scope",
      svc.replace(/\s*AND operating_company_id = \$2::uuid(?=[\s\S]{0,200}?qbo_bill_id IS NULL)/, ""),
      gen,
    ],
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
  const trigMutations = [
    ["trigger migration missing (LST-F412 verbatim)", null],
    ["trigger stamps QBO clones", mig.replace(/OR NEW\.qbo_bill_id IS NOT NULL/, "")],
    ["trigger overwrites a supplied display_id", mig.replace(/NEW\.display_id IS NOT NULL OR /, "")],
    ["trigger takes a different lock key", mig.replaceAll("'accounting.bill.display_id:'", "'accounting.bill.trigger:'")],
    ["trigger MAX+1 loses entity scope", mig.replace(/WHERE b\.operating_company_id = NEW\.operating_company_id\s*AND /, "WHERE ")],
    ["trigger not created", mig.replace(/CREATE TRIGGER trg_assign_bill_display_id/, "-- dropped")],
  ];
  for (const [why, m] of trigMutations) {
    if (m === mig) {
      inert.push(`${why} — MUTATION INERT (changed nothing; proves nothing)`);
      continue;
    }
    if (collectTriggerProblems(m).length === 0) inert.push(`${why} — NOT DETECTED`);
  }
  if (inert.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of inert) console.error("  - " + p);
    process.exit(1);
  }
  const total = mutations.length + trigMutations.length;
  console.log(`${LABEL} SELFTEST OK — ${total}/${total} mutations detected`);
  process.exit(0);
}

const problems = [...collectProblems(read(SERVICE), read(GENERATOR)), ...collectTriggerProblems(read(MIGRATION))];
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}

if (process.argv.includes("--live")) {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const trig = await client.query(
      `SELECT 1 FROM pg_trigger WHERE tgrelid = 'accounting.bills'::regclass AND tgname = 'trg_assign_bill_display_id' AND NOT tgisinternal`
    );
    const nulls = await client.query(
      `SELECT id::text, operating_company_id::text, created_at::text FROM accounting.bills
        WHERE qbo_bill_id IS NULL AND display_id IS NULL AND created_at >= $1::date ORDER BY created_at LIMIT 20`,
      [CUTOVER]
    );
    await client.query("ROLLBACK");
    const live = [];
    if (!trig.rows[0]) live.push("trg_assign_bill_display_id is not on accounting.bills (migration 202615430100 not applied)");
    for (const r of nulls.rows) live.push(`bill ${r.id} (entity ${r.operating_company_id}, created ${r.created_at}) has no display_id`);
    if (live.length) {
      console.error(`${LABEL}: LIVE FAIL`);
      for (const p of live) console.error("  ✗ " + p);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — trigger present; no TMS-native bill since ${CUTOVER} without a display_id`);
  } finally {
    client.release();
    await pool.end();
  }
}
console.log(
  `${LABEL} OK — createBill stamps a locked, entity-scoped, TMS-native-only display_id, so bills are ` +
    `no longer the only money document citable solely by UUID.`
);

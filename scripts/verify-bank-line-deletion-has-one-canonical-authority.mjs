#!/usr/bin/env node
/**
 * BANK-F431 — EVERY ENGINE THAT DELETES A BANK LINE ASKS THE SAME QUESTION, AND LEAVES A RECORD.
 *
 * Four shipped engines held four different laws about banking.bank_transactions, so whichever script
 * someone ran decided. bank-tx-dedup.ts PRESERVES a superseded Plaid pending row as merge evidence;
 * AUTH-101's purge deleted by "voided_at ALONE" (its own header) and took 274 of them on 2026-09-28;
 * AUTH-181's took 10 on 09-30 and 9 on 10-01; AUTH-400's never deletes from that table at all. And
 * audit.record_deletions held ZERO rows for the table after all 327 were gone, with no `action` and no
 * `changed_by_role` on the audit.row_changes rows — so the database could not say who did it.
 *
 * Nothing threw. Every engine was correct about its own law. That is why this needs a guard and not a
 * test: the failure is disagreement between engines, plus a delete that leaves no record.
 *
 *   RULE 1 — the canonical module exists and exports the predicate plus both record helpers.
 *   RULE 2 — the predicate carries ALL FIVE clauses. An engine importing four of them deletes
 *            something it should not.
 *   RULE 3 — every non-test file that DELETEs from banking.bank_transactions imports the canonical
 *            predicate. No engine may re-type its own criterion.
 *   RULE 4 — every such file also writes audit.record_deletions through a record helper. A delete
 *            with no record is a defect.
 *   RULE 5 — no engine may keep "voided_at IS NOT NULL OR is_sample_data = true" as the whole
 *            criterion for that table: that exact string is what ate the merge evidence.
 *
 * --selftest proves each rule can FAIL. A proof command that cannot fail is worse than no proof.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const NAME = "verify-bank-line-deletion-has-one-canonical-authority";
const CANON = "apps/backend/src/banking/bank-line-deletable.ts";
const CANON_IMPORT = "bank-line-deletable";
// A literal "DELETE FROM banking.bank_transactions" is the EASY case and it is NOT how the engines that
// deleted 327 bank lines are written. Both purge scripts delete through a dynamic table name --
// `DELETE FROM ${table}` / `DELETE FROM ${step.table}` -- with "banking.bank_transactions" listed in a
// table array. A guard that only matched the literal passed clean on the exact tree that caused this
// finding (measured: it did, before this was fixed). So an engine is EITHER spelling.
const DELETE_LITERAL_RE = /DELETE\s+FROM\s+banking\.bank_transactions/i;
const DELETE_DYNAMIC_RE = /DELETE\s+FROM\s+\$\{/;
const TABLE_LISTED_RE = /["'`]banking\.bank_transactions["'`]/;
const isBankLineDeletionEngine = (src) =>
  DELETE_LITERAL_RE.test(src) || (DELETE_DYNAMIC_RE.test(src) && TABLE_LISTED_RE.test(src));
// Line-scoped on purpose. The 09-30 purge legitimately uses this criterion for settlement_lines,
// check_number_registry, bills, expenses, invoices and driver_settlements. It is only wrong when it is
// the criterion for a BANK LINE, which means on the same line as the table name.
const OLD_CRITERION_ON_BANK_LINE = (src) =>
  src.split("\n").some((l) => /voided_at IS NOT NULL OR is_sample_data = true/.test(l) && /banking\.bank_transactions/.test(l));

const REQUIRED_CLAUSES = [
  ["voided_at IS NOT NULL", "clause 1: the row must be voided"],
  ["bankLineIsFeedSupersessionArtifact", "clause 2: feed-supersession artifacts are not voided transactions"],
  ["categorization_gl_account_id IS NULL", "clause 3a: no GL categorization"],
  ["matched_journal_entry_id IS NULL", "clause 3b: no matched journal entry"],
  ["reconciled_obligation_id IS NULL", "clause 3c: no reconciled obligation"],
  ["banking.reconciliation_matches", "clause 4: no match in a non-released state"],
  ["banking.bank_transaction_splits", "clause 5: no splits"],
];

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

function run({ canon, engines }) {
  const out = [];

  if (canon === null) {
    out.push(`RULE 1: ${CANON} is missing — there is no canonical answer to "may this bank line be deleted".`);
  } else {
    for (const fn of ["bankLineDeletablePredicate", "recordBankLineDeletionsSql", "recordBankLineDeletionsByIdSql"]) {
      if (!canon.includes(`export function ${fn}`)) out.push(`RULE 1: ${CANON} no longer exports ${fn}.`);
    }
    const pred = canon.slice(canon.indexOf("export function bankLineDeletablePredicate"));
    for (const [needle, why] of REQUIRED_CLAUSES) {
      if (!pred.includes(needle)) out.push(`RULE 2: the canonical predicate lost ${why} (${needle}).`);
    }
  }

  for (const [rel, src] of engines) {
    if (!isBankLineDeletionEngine(src)) continue;
    // AUTH-400's zero-reset engine deletes dynamically and names the table, but it never deletes FROM
    // it: it holds `banking` in PRESERVED_SCHEMAS and banking.bank_transactions in RESET_TABLES, where
    // a bank line is sent back to for_review instead. That exemption is STRUCTURAL, not a comment —
    // delete either declaration and this engine is policed like any other. (A comment-based opt-out
    // would be a loophole: anyone could add a DELETE and leave the comment in place.)
    const declaresResetOnly =
      /RESET_TABLES\s*=\s*new Set\(\[[^\]]*banking\.bank_transactions/s.test(src) &&
      /PRESERVED_SCHEMAS\s*=\s*new Set\(\[[^\]]*"banking"/s.test(src);
    if (declaresResetOnly) continue;
    if (!src.includes(CANON_IMPORT)) {
      out.push(`RULE 3: ${rel} deletes from banking.bank_transactions without importing the canonical predicate (${CANON_IMPORT}). voided_at alone is what ate 327 bank lines.`);
    }
    if (!/recordBankLineDeletions(ById)?Sql/.test(src)) {
      out.push(`RULE 4: ${rel} deletes from banking.bank_transactions without writing audit.record_deletions. A delete with no record is a defect.`);
    }
    if (OLD_CRITERION_ON_BANK_LINE(src)) {
      out.push(`RULE 5: ${rel} still carries the old criterion "voided_at IS NOT NULL OR is_sample_data = true" for a bank line.`);
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const goodCanon = `
export function bankLineIsFeedSupersessionArtifact(alias = "bt") { return "x"; }
export function bankLineDeletablePredicate(alias = "bt") {
  return \`( \${alias}.voided_at IS NOT NULL
    AND NOT \${bankLineIsFeedSupersessionArtifact(alias)}
    AND \${alias}.categorization_gl_account_id IS NULL
    AND \${alias}.matched_journal_entry_id IS NULL
    AND \${alias}.reconciled_obligation_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM banking.reconciliation_matches rm WHERE rm.match_state <> 'released')
    AND NOT EXISTS (SELECT 1 FROM banking.bank_transaction_splits s) )\`;
}
export function recordBankLineDeletionsSql(w) { return "i"; }
export function recordBankLineDeletionsByIdSql() { return "i"; }`;
  const goodEngine = `import { bankLineDeletablePredicate, recordBankLineDeletionsByIdSql } from "../../apps/backend/src/banking/bank-line-deletable.js";
    await client.query(recordBankLineDeletionsByIdSql(), [batch]);
    await client.query("DELETE FROM banking.bank_transactions WHERE id = ANY($1::uuid[])", [batch]);`;

  const cases = [
    ["a clean tree passes", { canon: goodCanon, engines: [["engine.ts", goodEngine]] }, 0],
    ["rule 1 catches the canonical module being gone", { canon: null, engines: [["engine.ts", goodEngine]] }, 1],
    ["rule 1 catches a dropped export",
      { canon: goodCanon.replace("export function recordBankLineDeletionsByIdSql", "function recordBankLineDeletionsByIdSql"), engines: [] }, 1],
    ["rule 2 catches the supersession clause being dropped (the whole defect)",
      { canon: goodCanon.split("\n").filter((l) => !l.includes("bankLineIsFeedSupersessionArtifact(alias)}")).join("\n"), engines: [] }, 1],
    ["rule 2 catches the splits clause being dropped",
      { canon: goodCanon.replace("banking.bank_transaction_splits s", "nothing"), engines: [] }, 1],
    ["rule 3 catches an engine that re-types its own criterion",
      { canon: goodCanon, engines: [["rogue.ts", 'await client.query("DELETE FROM banking.bank_transactions WHERE voided_at IS NOT NULL");']] }, 2],
    ["rule 4 catches a delete that leaves no record",
      { canon: goodCanon, engines: [["rogue.ts", 'import { bankLineDeletablePredicate } from "../bank-line-deletable.js";\nDELETE FROM banking.bank_transactions WHERE x']] }, 1],
    ["rule 5 catches the old criterion surviving on the bank-line step",
      { canon: goodCanon, engines: [["engine.ts", goodEngine + '\nconst steps = [{ table: "banking.bank_transactions", pred: "voided_at IS NOT NULL OR is_sample_data = true" }];']] }, 1],
    ["rule 3 catches the DYNAMIC spelling the real purge engines use (the false-green this guard shipped with)",
      { canon: goodCanon, engines: [["purge.ts", 'const ORDER = [{ table: "banking.bank_transactions", pred: "voided_at IS NOT NULL" }];\nawait client.query(`DELETE FROM ${step.table} WHERE ${where}`, params);']] }, 2],
    ["a reset-only engine that structurally declares the table reset-only is exempt",
      { canon: goodCanon, engines: [["reset.ts", 'const PRESERVED_SCHEMAS = new Set(["identity", "banking"]);\nconst RESET_TABLES = new Set(["banking.bank_transactions"]);\nawait client.query(`DELETE FROM ${t} WHERE id = ANY($1)`, [rows]);']] }, 0],
    ["the exemption collapses the moment the reset declaration goes",
      { canon: goodCanon, engines: [["reset.ts", 'const PRESERVED_SCHEMAS = new Set(["identity", "banking"]);\nconst DELETE_TABLES = new Set(["banking.bank_transactions"]);\nawait client.query(`DELETE FROM ${t} WHERE id = ANY($1)`, [rows]);']] }, 2],
    ["rule 5 does NOT fire when the old criterion belongs to a different table on its own line",
      { canon: goodCanon, engines: [["purge.ts", goodEngine + '\nconst steps = [{ table: "accounting.invoices", pred: "voided_at IS NOT NULL OR is_sample_data = true" }];']] }, 0],
    ["a file that never deletes from the table is not policed",
      { canon: goodCanon, engines: [["reader.ts", "SELECT * FROM banking.bank_transactions WHERE voided_at IS NULL"]] }, 0],
  ];

  let ok = 0;
  for (const [label, src, expected] of cases) {
    const got = run(src).length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected}, got ${got}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

// The live sweep covers BOTH trees. scripts/ops/ is where all 327 deletions actually came from, and the
// pre-existing guard (verify-no-hard-delete-bank-stubs.mjs) never looked there.
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist" || e === "__tests__") continue;
    const full = path.join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|mts|mjs|js)$/.test(e) && !/\.test\.|\.db\.test\./.test(e)) acc.push(full);
  }
  return acc;
}

const files = [...walk("apps/backend/src"), ...walk("scripts")]
  .filter((f) => !f.endsWith(path.normalize(CANON)) && !f.includes("verify-"));
const engines = files.map((f) => [f, readFileSync(f, "utf8")]);

const failures = run({ canon: read(CANON), engines });
if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} rule(s) broken.`);
  process.exit(1);
}
console.log(`${NAME}: PASS — one canonical deletable predicate, all five clauses intact, and every engine that deletes a bank line imports it and records the deletion (${engines.length} files swept).`);

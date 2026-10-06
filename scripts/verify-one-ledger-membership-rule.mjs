#!/usr/bin/env node
/**
 * ACCT-F2026100601 — ONE rule decides which journal-entry postings make up the books.
 *
 * The rule (not voided · not sample data · outside a batch or in a posted/reversed batch) was hand-typed in ~15
 * readers and they disagreed: the statements left sample data out, Reclassify, the period-close cash snapshot, the
 * bank tie-out, the load-costs board and accounting.fn_account_balances_as_of did not. It now lives in
 * apps/backend/src/accounting/ledger-membership.ts. This guard holds that:
 *   RULE 1  no backend source re-types the batch clause `batch_status IN ('posted', 'reversed')` outside that module
 *           (tests excluded). Re-typing it is how the copies drifted; import ledgerPostingCountsSql instead.
 *   RULE 2  the module still carries all three clauses (a weakened module would weaken every reader at once).
 *   RULE 3  every report reader imports the module.
 *   RULE 4  LIVE: accounting.fn_account_balances_as_of — which SQL cannot import — holds all three clauses in its
 *           definition. Without a database this arm reports UNVERIFIED (exit 2), never a pass.
 *
 * Run: node scripts/verify-one-ledger-membership-rule.mjs [--selftest]
 */
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-one-ledger-membership-rule";
export const REQUIRES_LIVE_DB = "RULE 4 requires reading accounting.fn_account_balances_as_of from the live database; the static rules (1-3) run here and the live arm runs in money-pr-local-gate with DATABASE_URL";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE = "apps/backend/src/accounting/ledger-membership.ts";
const BATCH_CLAUSE_RE = /batch_status\s+IN\s*\(\s*'posted'\s*,\s*'reversed'\s*\)/;
const CLAUSES = [/status\s*<>\s*'voided'/, /is_sample_data/, BATCH_CLAUSE_RE];
export const READERS = [
  "apps/backend/src/accounting/trial-balance.service.ts",
  "apps/backend/src/accounting/balance-sheet.service.ts",
  "apps/backend/src/accounting/profit-loss.service.ts",
  "apps/backend/src/accounting/cash-flow.service.ts",
  "apps/backend/src/accounting/cash-basis/profit-loss-cash.service.ts",
  "apps/backend/src/accounting/cash-basis/period-close-snapshot.service.ts",
  "apps/backend/src/accounting/reclassify/reclassify.service.ts",
  "apps/backend/src/accounting/load-costs-board.routes.ts",
  "apps/backend/src/banking/bank-tieout.service.ts",
];

/** Pure: { files: {rel: src}, moduleSrc, fnDef|null } -> problems[] */
export function evaluate({ files, moduleSrc, fnDef }) {
  const problems = [];
  for (const [rel, src] of Object.entries(files)) {
    if (rel === MODULE) continue;
    const code = src.replace(/\/\/[^\n]*/g, "");
    if (BATCH_CLAUSE_RE.test(code)) problems.push(`RULE 1: ${rel} re-types the ledger batch clause — import ledgerPostingCountsSql from accounting/ledger-membership.ts`);
  }
  CLAUSES.forEach((re, i) => { if (!re.test(moduleSrc)) problems.push(`RULE 2: ${MODULE} lost clause ${i + 1} (${re.source})`); });
  for (const rel of READERS) {
    const src = files[rel];
    if (src === undefined) problems.push(`RULE 3: reader ${rel} is missing`);
    else if (!/from\s+["'][./]*(?:accounting\/)?ledger-membership\.js["']/.test(src)) problems.push(`RULE 3: ${rel} does not import ledger-membership`);
  }
  if (fnDef !== null) {
    CLAUSES.forEach((re, i) => { if (!re.test(fnDef)) problems.push(`RULE 4: accounting.fn_account_balances_as_of lacks clause ${i + 1} (${re.source}) — it disagrees with every statement`); });
  }
  return problems;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "__tests__") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const readTree = () => Object.fromEntries(walk(path.join(ROOT, "apps/backend/src")).map((f) => [path.relative(ROOT, f).split(path.sep).join("/"), fs.readFileSync(f, "utf8")]));

if (process.argv.includes("--selftest")) {
  const moduleSrc = fs.readFileSync(path.join(ROOT, MODULE), "utf8");
  const files = readTree();
  const goodFn = "WHERE p.operating_company_id = x AND je.status <> 'voided' AND COALESCE(je.is_sample_data, false) = false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))";
  const cases = [
    ["the tree as committed passes (static)", evaluate({ files, moduleSrc, fnDef: null }).length === 0],
    ["a reader that re-types the batch clause fails", evaluate({ files: { ...files, "apps/backend/src/x/rogue.ts": "AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed'))" }, moduleSrc, fnDef: null }).some((p) => p.startsWith("RULE 1"))],
    ["a module that drops the sample-data clause fails", evaluate({ files, moduleSrc: moduleSrc.replace(/is_sample_data/g, "x"), fnDef: null }).some((p) => p.startsWith("RULE 2"))],
    ["a reader that stops importing the module fails", evaluate({ files: { ...files, [READERS[0]]: "export const x = 1;" }, moduleSrc, fnDef: null }).some((p) => p.startsWith("RULE 3"))],
    ["a database function without the sample-data clause fails", evaluate({ files, moduleSrc, fnDef: goodFn.replace("AND COALESCE(je.is_sample_data, false) = false ", "") }).some((p) => p.startsWith("RULE 4"))],
    ["a database function with all three clauses passes", evaluate({ files, moduleSrc, fnDef: goodFn }).length === 0],
    ["a comment mentioning the clause is not a copy", evaluate({ files: { ...files, "apps/backend/src/x/doc.ts": "// pb.batch_status IN ('posted', 'reversed') is the rule" }, moduleSrc, fnDef: null }).length === 0],
  ];
  for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, ok]) => !ok).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const files = readTree();
const moduleSrc = fs.readFileSync(path.join(ROOT, MODULE), "utf8");
let fnDef = null;
const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (url) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url });
  try {
    await c.connect();
    fnDef = (await c.query(`SELECT pg_get_functiondef('accounting.fn_account_balances_as_of(uuid,date,date)'::regprocedure) AS d`)).rows[0]?.d ?? "";
  } catch (e) {
    console.error(`${LABEL}: FAIL — could not read accounting.fn_account_balances_as_of: ${String(e.message).split("\n")[0]}`);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
}
const problems = evaluate({ files, moduleSrc, fnDef });
if (problems.length) {
  for (const p of problems) console.error(`${LABEL}: ${p}`);
  console.error(`${LABEL}: FAIL — ${problems.length} problem(s).`);
  process.exit(1);
}
if (fnDef === null) {
  console.log(`${LABEL}: static PASS (${READERS.length} readers import the rule, 0 re-typed copies); UNVERIFIED — no DATABASE_URL, the database function was not read.`);
  process.exit(2);
}
console.log(`${LABEL}: PASS — one ledger-membership rule: ${READERS.length} readers import it, 0 re-typed copies, and accounting.fn_account_balances_as_of holds all three clauses.`);

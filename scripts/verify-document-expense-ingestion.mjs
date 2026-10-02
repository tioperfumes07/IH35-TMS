#!/usr/bin/env node
// ROUND 326 queue item 9 (G-01, CC-1) — DOCUMENT-EXPENSE INGESTION ENGINE. Signed documents' expense lines were
// never created because seedSettlementDocument is whole-document idempotent (an existing settlement returns at
// once). This guard fails if the ingestion engine:
//   1. stops deduping (dedupeCompanyExpenses), attributing exactly (attributeExpenseLoad) or writing through the
//      one per-line writer (seedExpense, which resolves items BY ID through the catalog map);
//   2. stops isolating each line in a SAVEPOINT, stops stamping source_settlement_ref, or loses dry_run;
//   3. touches the bank (banking.*), or its route stops being owner-gated (AUTHORITY_ROLES) / defaulting to dry run.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-document-expense-ingestion";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  svc: "apps/backend/src/feed/document-expense-ingestion.service.ts",
  routes: "apps/backend/src/feed/seed-settlement-document.routes.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  const svc = strip(src.svc);
  for (const need of ["dedupeCompanyExpenses(", "attributeExpenseLoad(", "await seedExpense(", "matchSettlementPdfItem("]) if (!svc.includes(need)) p.push(`the ingestion engine must use ${need.replace("await ", "").slice(0, -1)}`);
  if (!/SAVEPOINT doc_expense_line[\s\S]*ROLLBACK TO SAVEPOINT doc_expense_line/.test(svc)) p.push("each line must run in its own SAVEPOINT (one refused line never drops the rest)");
  if (!/SET source_settlement_ref = \$3/.test(svc)) p.push("ingested expenses must carry source_settlement_ref = the document number");
  if (!/if \(input\.dryRun\)/.test(svc)) p.push("the engine must support a dry run that writes nothing");
  if (/banking\./.test(svc)) p.push("the ingestion engine must never touch the bank");
  if (/INSERT INTO accounting\.expenses/.test(svc)) p.push("the ingestion engine writes expenses directly — it must go through seedExpense");
  const routes = strip(src.routes);
  if (!/settlement-document\/expenses[\s\S]{0,400}AUTHORITY_ROLES\.has/.test(routes)) p.push("the ingestion route must be owner-gated (AUTHORITY_ROLES)");
  if (!/dry_run: z\.boolean\(\)\.default\(true\)/.test(routes)) p.push("the ingestion route must default to a dry run");
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["no dedupe", { ...src, svc: src.svc.replace("return dedupeCompanyExpenses(doc.expenses)", "return doc.expenses.map((x) => x)") }],
      ["no savepoint", { ...src, svc: src.svc.replaceAll("ROLLBACK TO SAVEPOINT doc_expense_line", "ROLLBACK") }],
      ["bank touched", { ...src, svc: src.svc + "\nconst q = 'UPDATE banking.bank_transactions SET x = 1';" }],
      ["live by default", { ...src, routes: src.routes.replace("dry_run: z.boolean().default(true)", "dry_run: z.boolean().default(false)") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — signed-document expense lines ingest per line (dedupe, exact load, catalog map by id, savepoint, source_settlement_ref), owner-run, dry run by default, never the bank.`);
}

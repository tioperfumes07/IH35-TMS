#!/usr/bin/env node
/**
 * LEAD 443.160 STEP 3 — "a duplicate writer is how duplicate records are created": same-function forms (every bill
 * type; every expense type; Receive Payment vs bank-match receive; Bill Payment vs Pay Bills) must end in ONE backend
 * writer per document.
 *
 * Census on main 2026-10-16 (INSERT INTO <document> sites in apps/backend/src, tests excluded): bills 11 sites / 7 files,
 * expenses 13 / 9, payments 2 / 2, bill_payments 9 / 9. Each document's canonical writer is named below. Every other
 * site is pinned in 18481-document-writers.baseline.json — SHRINK-ONLY: a new file, more sites in a listed file, or a
 * baseline that grows against origin/main fails. Repointing a site to the canonical writer lowers its count.
 *
 * --selftest: plants each regression and asserts the guard fails.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASELINE_REL = "scripts/verify-steps/18481-document-writers.baseline.json";

/** The one writer each document's same-function forms converge on. */
export const CANONICAL = {
  bills: "apps/backend/src/accounting/bills.service.ts",
  expenses: "apps/backend/src/accounting/expense-writer.service.ts",
  payments: "apps/backend/src/accounting/payments.routes.ts",
  bill_payments: "apps/backend/src/accounting/bills.service.ts",
};
const TABLE = { bills: "accounting\\.bills", expenses: "accounting\\.expenses", payments: "accounting\\.payments", bill_payments: "accounting\\.bill_payments" };

function backendFiles(dir = resolve(ROOT, "apps/backend/src"), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") backendFiles(abs, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(abs);
  }
  return out;
}

export function census(files) {
  const sites = {};
  for (const [rel, src] of files) {
    for (const [doc, t] of Object.entries(TABLE)) {
      const n = (src.match(new RegExp(`INSERT\\s+INTO\\s+${t}\\s*\\(`, "gi")) ?? []).length;
      if (n) (sites[doc] ??= {})[rel] = n;
    }
  }
  return sites;
}

export function check(files, baseline, mainBaseline) {
  const findings = [];
  const sites = census(files);
  for (const [doc, canon] of Object.entries(CANONICAL)) {
    if (!(sites[doc] ?? {})[canon]) findings.push(`${doc}: the canonical writer ${canon} no longer writes it`);
  }
  for (const [doc, byFile] of Object.entries(sites)) {
    for (const [rel, n] of Object.entries(byFile)) {
      const cap = (baseline[doc] ?? {})[rel];
      if (cap == null) findings.push(`${doc}: ${rel} is a NEW writer (${n}) — route it through ${CANONICAL[doc]}`);
      else if (n > cap) findings.push(`${doc}: ${rel} has ${n} writer sites, baseline caps it at ${cap}`);
    }
  }
  if (mainBaseline) {
    for (const [doc, byFile] of Object.entries(baseline)) {
      for (const [rel, cap] of Object.entries(byFile)) {
        const was = (mainBaseline[doc] ?? {})[rel];
        if (was == null) findings.push(`${BASELINE_REL}: ${doc} gained ${rel} — the baseline only shrinks`);
        else if (cap > was) findings.push(`${BASELINE_REL}: ${doc} ${rel} raised ${was} → ${cap} — the baseline only shrinks`);
      }
    }
  }
  return findings;
}


/**
 * LEAD 443.182 C step 2 — the DEEP expense engine block (separate from the INSERT census above). Outside
 * accounting/expense-writer.service.ts, a file may not number an expense (generateExpenseNumber / nextExpenseDisplayId),
 * write an expense header or line (insertExpenseHeader / insertExpenseLine / INSERT INTO accounting.expense_lines), write
 * an expense load link (insertExpenseLoadLink / INSERT INTO expense_attribution.expense_load_links) or post an expense
 * JE (postSourceTransaction[InClientTx] with source_transaction_type "expense"). The two primitive definitions
 * (expense-attribution/expense-number.ts, accounting/display-id.ts) are the engine's own building blocks and are not
 * counted. Every remaining site is pinned per file in the baseline's `expense_engine` block — SHRINK-ONLY.
 */
export const EXPENSE_ENGINE = "apps/backend/src/accounting/expense-writer.service.ts";
const ENGINE_PRIMITIVES = new Set(["apps/backend/src/expense-attribution/expense-number.ts", "apps/backend/src/accounting/display-id.ts"]);
const ENGINE_PATTERNS = {
  expense_number: /(?<!function\s)\b(?:generateExpenseNumber|nextExpenseDisplayId)\(/g,
  expense_row: /(?<!function\s)\binsertExpense(?:Header|Line)\(|INSERT\s+INTO\s+accounting\.expense_lines\s*\(/gi,
  expense_load_link: /(?<!function\s)\binsertExpenseLoadLink\(|INSERT\s+INTO\s+expense_attribution\.expense_load_links\b/gi,
  expense_je_post: /\bpostSourceTransaction(?:InClientTx)?\((?:(?!\bpostSourceTransaction)[\s\S]){0,500}?source_transaction_type:\s*["']expense["']/g,
};

export function expenseEngineCensus(files) {
  const sites = {};
  for (const [rel, src] of files) {
    if (rel === EXPENSE_ENGINE || ENGINE_PRIMITIVES.has(rel)) continue;
    for (const [kind, re] of Object.entries(ENGINE_PATTERNS)) {
      const n = (src.match(re) ?? []).length;
      if (n) (sites[kind] ??= {})[rel] = n;
    }
  }
  return sites;
}

export function checkExpenseEngine(files, baseline, mainBaseline) {
  const findings = [];
  const engineSrc = (files.find(([p]) => p === EXPENSE_ENGINE) ?? [, ""])[1];
  for (const fn of ["writeExpenseDocumentInClientTx", "postExpenseDocumentInClientTx", "reserveExpenseNumber"]) {
    if (!new RegExp(`export async function ${fn}\\(`).test(engineSrc)) findings.push(`expense_engine: ${EXPENSE_ENGINE} no longer exports ${fn}`);
  }
  for (const [kind, byFile] of Object.entries(expenseEngineCensus(files))) {
    for (const [rel, n] of Object.entries(byFile)) {
      const cap = (baseline?.[kind] ?? {})[rel];
      if (cap == null) findings.push(`expense_engine ${kind}: ${rel} (${n}) — hand the document to ${EXPENSE_ENGINE} instead`);
      else if (n > cap) findings.push(`expense_engine ${kind}: ${rel} has ${n}, baseline caps it at ${cap}`);
    }
  }
  if (mainBaseline) {
    for (const [kind, byFile] of Object.entries(baseline ?? {})) {
      for (const [rel, cap] of Object.entries(byFile)) {
        const was = (mainBaseline[kind] ?? {})[rel];
        if (was == null) findings.push(`${BASELINE_REL}: expense_engine ${kind} gained ${rel} — the baseline only shrinks`);
        else if (cap > was) findings.push(`${BASELINE_REL}: expense_engine ${kind} ${rel} raised ${was} → ${cap} — the baseline only shrinks`);
      }
    }
  }
  return findings;
}

const readAll = () => backendFiles().map((abs) => [relative(ROOT, abs), readFileSync(abs, "utf8")]);

if (process.argv.includes("--write-engine-baseline")) {
  // Writes ONLY the expense_engine block (the writers block is untouched — it is shrunk by hand per document).
  const file = JSON.parse(readFileSync(resolve(ROOT, BASELINE_REL), "utf8"));
  file.expense_engine = expenseEngineCensus(readAll());
  writeFileSync(resolve(ROOT, BASELINE_REL), JSON.stringify(file, null, 2) + "\n");
  console.log("expense_engine baseline written");
  process.exit(0);
}

if (process.argv.includes("--write-baseline")) {
  writeFileSync(resolve(ROOT, BASELINE_REL), JSON.stringify({
    _doc: "LEAD 443.160 STEP 3 — INSERT sites per document per file (census 2026-10-16). SHRINK-ONLY: repoint a site to the document's canonical writer (see the guard's CANONICAL) and lower its count; never add a file or raise a count.",
    writers: census(readAll()),
    expense_engine: expenseEngineCensus(readAll()),
  }, null, 2) + "\n");
  console.log("baseline written");
  process.exit(0);
}

const files = readAll();
const baselineFile = JSON.parse(readFileSync(resolve(ROOT, BASELINE_REL), "utf8"));
const baseline = baselineFile.writers;
const engineBaseline = baselineFile.expense_engine ?? {};
const r = spawnSync("git", ["show", `origin/main:${BASELINE_REL}`], { cwd: ROOT, encoding: "utf8" });
const mainFile = r.status === 0 ? JSON.parse(r.stdout) : null;
const mainBaseline = mainFile ? mainFile.writers : null;
// First introduction of the block: main has none yet, so there is nothing to shrink against.
const mainEngineBaseline = mainFile?.expense_engine ?? null;

if (process.argv.includes("--selftest")) {
  if (check(files, baseline, mainBaseline).length || checkExpenseEngine(files, engineBaseline, mainEngineBaseline).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(files, baseline, mainBaseline), checkExpenseEngine(files, engineBaseline, mainEngineBaseline));
    process.exit(1);
  }
  const X = "apps/backend/src/x.ts";
  const enginePlants = [
    ["an expense numbered outside the engine", [...files, [X, "const n = await generateExpenseNumber(client, loadId, co);"]], engineBaseline, mainEngineBaseline],
    ["an EXP number outside the engine", [...files, [X, "const n = await nextExpenseDisplayId(client, co);"]], engineBaseline, mainEngineBaseline],
    ["an expense line INSERT outside the engine", [...files, [X, "q(`INSERT INTO accounting.expense_lines (expense_id) VALUES ($1)`)"]], engineBaseline, mainEngineBaseline],
    ["a load link outside the engine", [...files, [X, "await insertExpenseLoadLink(client, link);"]], engineBaseline, mainEngineBaseline],
    ["an expense JE post outside the engine", [...files, [X, "await postSourceTransactionInClientTx(client, { operating_company_id: co, source_transaction_type: \"expense\", source_transaction_id: id }, a);"]], engineBaseline, mainEngineBaseline],
    ["engine export gone", files.map(([p, src]) => [p, p === EXPENSE_ENGINE ? src.replace("export async function writeExpenseDocumentInClientTx(", "async function x(") : src]), engineBaseline, mainEngineBaseline],
    ["engine baseline grows", files, { ...engineBaseline, expense_number: { ...(engineBaseline.expense_number ?? {}), [X]: 1 } }, engineBaseline],
  ];
  for (const [name, f, b, m] of enginePlants) {
    if (checkExpenseEngine(f, b, m).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  // A bill post is not an expense post; a definition is not a call.
  if (checkExpenseEngine([...files, [X, "await postSourceTransactionInClientTx(client, { source_transaction_type: \"bill\" });\nexport async function generateExpenseNumber(x) {}"]], engineBaseline, mainEngineBaseline).length) {
    console.error("SELFTEST FAIL: a bill post / a definition was counted as an expense-engine site");
    process.exit(1);
  }
  const plants = [
    ["new bill writer", [...files, ["apps/backend/src/x.ts", "q(`INSERT INTO accounting.bills (id) VALUES ($1)`)"]], baseline, mainBaseline],
    ["new payment writer", [...files, ["apps/backend/src/x.ts", "q(`insert into accounting.payments (id) values ($1)`)"]], baseline, mainBaseline],
    ["more sites in a listed file", files.map(([p, s]) => [p, p === CANONICAL.expenses ? s : p === "apps/backend/src/accounting/recurring.worker.ts" ? s + "\nq(`INSERT INTO accounting.expenses (id) VALUES (1)`)" : s]), baseline, mainBaseline],
    ["canonical writer gone", files.filter(([p]) => p !== CANONICAL.payments), baseline, mainBaseline],
    ["baseline grows", files, { ...baseline, bills: { ...baseline.bills, "apps/backend/src/x.ts": 1 } }, baseline],
  ];
  for (const [name, f, b, m] of plants) {
    if (check(f, b, m).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length + enginePlants.length} plants caught (incl. ${enginePlants.length} expense-engine)`);
  process.exit(0);
}

const findings = [...check(files, baseline, mainBaseline), ...checkExpenseEngine(files, engineBaseline, mainEngineBaseline)];
if (findings.length) {
  console.error(`verify-one-writer-per-document FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
const sites = census(files);
const engineSites = expenseEngineCensus(files);
console.log(`verify-one-writer-per-document expense engine: ${Object.entries(engineSites).map(([k, m]) => `${k} ${Object.values(m).reduce((a, b) => a + b, 0)}/${Object.keys(m).length} files`).join(" · ") || "no site outside the engine"}`);
console.log(`verify-one-writer-per-document PASS: ${Object.entries(sites).map(([d, m]) => `${d} ${Object.values(m).reduce((a, b) => a + b, 0)} sites/${Object.keys(m).length} files`).join(" · ")} (shrink-only)`);

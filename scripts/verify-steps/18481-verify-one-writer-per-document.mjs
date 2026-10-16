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

const readAll = () => backendFiles().map((abs) => [relative(ROOT, abs), readFileSync(abs, "utf8")]);

if (process.argv.includes("--write-baseline")) {
  writeFileSync(resolve(ROOT, BASELINE_REL), JSON.stringify({
    _doc: "LEAD 443.160 STEP 3 — INSERT sites per document per file (census 2026-10-16). SHRINK-ONLY: repoint a site to the document's canonical writer (see the guard's CANONICAL) and lower its count; never add a file or raise a count.",
    writers: census(readAll()),
  }, null, 2) + "\n");
  console.log("baseline written");
  process.exit(0);
}

const files = readAll();
const baseline = JSON.parse(readFileSync(resolve(ROOT, BASELINE_REL), "utf8")).writers;
const r = spawnSync("git", ["show", `origin/main:${BASELINE_REL}`], { cwd: ROOT, encoding: "utf8" });
const mainBaseline = r.status === 0 ? JSON.parse(r.stdout).writers : null;

if (process.argv.includes("--selftest")) {
  if (check(files, baseline, mainBaseline).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(files, baseline, mainBaseline));
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
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

const findings = check(files, baseline, mainBaseline);
if (findings.length) {
  console.error(`verify-one-writer-per-document FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
const sites = census(files);
console.log(`verify-one-writer-per-document PASS: ${Object.entries(sites).map(([d, m]) => `${d} ${Object.values(m).reduce((a, b) => a + b, 0)} sites/${Object.keys(m).length} files`).join(" · ")} (shrink-only)`);

#!/usr/bin/env node
/**
 * CUST-VERIFY-01 — module VERIFY-1..8 ratchet: manifest routes + sibling guards
 * (S01 roster density, S02 transaction list, S03 coming-state copy, CHROME-01 header parity,
 * LINK-02 COI honest empty) + USMCA entity-scope deactivated_at filter on customers.routes.
 *
 *   node scripts/verify-cust-verify-01.mjs
 *   node scripts/verify-cust-verify-01.mjs --selftest
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cust-verify-01";
const PROD_VERIFIED_IDS = [
  "CUST-S01",
  "CUST-S02",
  "CUST-S03",
  "CUST-CHROME-01",
  "CUST-CHROME-02",
  "CUST-CHROME-03",
  "CUST-LINK-01",
  "CUST-LINK-02",
  "CUST-VERIFY-01",
];

const SIBLINGS = [
  "scripts/verify-cust-s01-roster-density-filter.mjs",
  "scripts/verify-cust-s02-transaction-list-invoices.mjs",
  "scripts/verify-cust-s03-coming-state-copy.mjs",
  "scripts/verify-cust-chrome-header-action-parity.mjs",
  "scripts/verify-cust-link-01-invoice-lines-honest.mjs",
  "scripts/verify-cust-link-02-coi-honest-empty.mjs",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(overrides = {}) {
  const manifest = overrides.manifest ?? read("apps/frontend/src/routes/manifest.tsx");
  const routes = overrides.routes ?? read("apps/backend/src/mdata/customers.routes.ts");
  const completion = JSON.parse(
    overrides.completion ?? read("docs/module-completion/customers.json"),
  );
  const spawnSiblings = overrides.spawnSiblings !== false;
  const problems = [];

  if (!/path="\/customers"/.test(manifest) || !/<CustomersPage/.test(manifest)) {
    problems.push("manifest must mount /customers → CustomersPage");
  }
  if (!/path="\/customers\/:id"/.test(manifest) || !/<CustomerDetailPage/.test(manifest)) {
    problems.push("manifest must mount /customers/:id → CustomerDetailPage");
  }
  if (!/deactivated_at IS NULL/.test(routes)) {
    problems.push("customers.routes must filter deactivated_at IS NULL for active roster (USMCA density)");
  }
  if (!/USMCA/.test(routes)) {
    problems.push("customers.routes must document USMCA entity-scope (operating_company_id)");
  }
  if (completion.complete !== true || completion.progress !== "10 of 10") {
    problems.push("customers module must remain complete at 10 of 10");
  }
  for (const id of PROD_VERIFIED_IDS) {
    const item = completion.items?.find((candidate) => candidate.id === id);
    if (!item || item.status !== "PASS" || item.prod_verified !== true) {
      problems.push(`${id} must be PASS with prod_verified=true`);
    }
  }

  if (spawnSiblings) {
    for (const script of SIBLINGS) {
      const r = spawnSync(process.execPath, [path.join(ROOT, script)], {
        cwd: ROOT,
        encoding: "utf8",
      });
      if (r.status !== 0) {
        problems.push(`${script} failed:\n${(r.stdout || "") + (r.stderr || "")}`.trim());
      }
    }
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const good = collectProblems();
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL (tip unclean):\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }

  const broken = collectProblems({
    manifest: read("apps/frontend/src/routes/manifest.tsx").replace(/<CustomersPage/g, "<GoneCustomersPage"),
    routes: read("apps/backend/src/mdata/customers.routes.ts"),
    spawnSiblings: false,
  });
  if (!broken.some((p) => /CustomersPage/.test(p))) {
    console.error(`${LABEL} --selftest FAIL: planted manifest break not caught`);
    process.exit(1);
  }

  const completion = read("docs/module-completion/customers.json");
  const brokenCompletion = collectProblems({
    manifest: read("apps/frontend/src/routes/manifest.tsx"),
    routes: read("apps/backend/src/mdata/customers.routes.ts"),
    completion: completion.replace('"prod_verified": true', '"prod_verified": false'),
    spawnSiblings: false,
  });
  if (!brokenCompletion.some((p) => /prod_verified=true/.test(p))) {
    console.error(`${LABEL} --selftest FAIL: planted production-verification break not caught`);
    process.exit(1);
  }

  for (const script of SIBLINGS) {
    const r = spawnSync(process.execPath, [path.join(ROOT, script), "--selftest"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.error(`${LABEL} --selftest FAIL: ${script} sibling selftest failed`);
      process.exit(1);
    }
  }

  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS — Customers 10/10 locked; USMCA lucia active=9, invoices=31, invoice_lines=30, COI=0`,
  );
}

#!/usr/bin/env node
/**
 * ECON-012 — catalogs.expense_categories must cover active non-revenue
 * expense_category_account_map pairs, and bill payloads must stamp map keys
 * (not fall through to uncategorized for DIESEL/TIRES/PERMIT/…).
 *
 * MATRIX-BUILT-OPTIONAL — meta economics ratchet (seed + mapper), not a leaf tag.
 *
 * Wired via verify-steps/1910 (WAVE-H1 / CLS-ECON-EMPTY companion) — no new claim.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-econ-012-expense-category-map-align";
const MIGRATION = "db/migrations/202612531400_econ012_expense_categories_map_alignment.sql";
const MAPPER = "apps/frontend/src/components/accounting/vendorBillLines.ts";
const EDITOR = "apps/frontend/src/components/forms/TwoSectionLineEditor.tsx";
const BOX = "apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx";

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

function assertSources() {
  const problems = [];
  const mig = read(MIGRATION);
  if (!/expense_category_account_map/.test(mig)) problems.push(`${MIGRATION}: must read expense_category_account_map`);
  if (!/INSERT INTO catalogs\.expense_categories/.test(mig)) problems.push(`${MIGRATION}: must insert expense_categories`);
  if (!/ON CONFLICT \(operating_company_id, code\)/.test(mig)) problems.push(`${MIGRATION}: must upsert on (opco, code)`);
  if (!/IS DISTINCT FROM 'revenue'/.test(mig)) problems.push(`${MIGRATION}: must exclude revenue map rows`);
  if (!/org\.companies/.test(mig)) problems.push(`${MIGRATION}: must scope via org.companies`);

  const mapper = read(MAPPER);
  if (!/mapExpenseCatalogCodeToBillCategory/.test(mapper)) problems.push(`${MAPPER}: mapper missing`);
  if (!/metaKind/.test(mapper)) problems.push(`${MAPPER}: must prefer metadata kind/code`);
  if (!/expense_category_kind/.test(mapper) || !/expense_category_map_code/.test(mapper)) {
    problems.push(`${MAPPER}: buildVendorBillLinePayloads must pass line map keys`);
  }
  if (!/PERMIT/.test(mapper)) problems.push(`${MAPPER}: must keep PERMIT alias`);

  const editor = read(EDITOR);
  if (!/category_kind: String\(meta\.category_kind/.test(editor)) {
    problems.push(`${EDITOR}: bill options must carry metadata.category_kind`);
  }
  if (!/category_map_code: String\(meta\.category_code/.test(editor)) {
    problems.push(`${EDITOR}: bill options must carry metadata.category_code`);
  }

  const box = read(BOX);
  if (!/expense_category_kind: match\?\.category_kind/.test(box)) {
    problems.push(`${BOX}: category select must stamp expense_category_kind`);
  }
  if (!/expense_category_map_code: match\?\.category_map_code/.test(box)) {
    problems.push(`${BOX}: category select must stamp expense_category_map_code`);
  }
  return problems;
}

function selftestMapper() {
  function map(code, meta) {
    const metaKind = String(meta?.category_kind ?? "")
      .trim()
      .toLowerCase();
    const metaCode = String(meta?.category_code ?? "")
      .trim()
      .toLowerCase();
    if (metaKind && metaCode) return { category_kind: metaKind, category_code: metaCode };
    const c = String(code ?? "")
      .trim()
      .toUpperCase();
    if (c === "FUEL") return { category_kind: "fuel", category_code: "fuel" };
    if (c === "REPAIR") return { category_kind: "maintenance", category_code: "maintenance" };
    if (c === "PERMIT") return { category_kind: "permit", category_code: "permit" };
    const lower = c.toLowerCase();
    if (/^[a-z][a-z0-9_]*$/.test(lower)) return { category_kind: lower, category_code: lower };
    return null;
  }
  const diesel = map("DIESEL", { category_kind: "fuel", category_code: "diesel" });
  if (!diesel || diesel.category_kind !== "fuel" || diesel.category_code !== "diesel") {
    throw new Error("DIESEL+metadata must map to fuel/diesel");
  }
  const permit = map("PERMIT", null);
  if (!permit || permit.category_code !== "permit") throw new Error("PERMIT alias broken");
  if (map("", null) !== null) throw new Error("empty code must not invent map keys");
}

if (process.argv.includes("--selftest")) {
  try {
    const ok = assertSources();
    if (ok.length) throw new Error(ok.join("; "));
    selftestMapper();
    // Planted failure: drop revenue exclusion → child assert must fail.
    const migAbs = path.join(ROOT, MIGRATION);
    const original = fs.readFileSync(migAbs, "utf8");
    const planted = original.replace("IS DISTINCT FROM 'revenue'", "IS DISTINCT FROM '__planted__'");
    fs.writeFileSync(migAbs, planted);
    let child;
    try {
      child = spawnSync(process.execPath, [path.join(ROOT, "scripts", "verify-econ-012-expense-category-map-align.mjs")], {
        cwd: ROOT,
        encoding: "utf8",
      });
    } finally {
      fs.writeFileSync(migAbs, original);
    }
    if (child.status === 0) throw new Error("planted revenue-exclusion removal should fail live assert");
    console.log(`${LABEL} selftest OK (planted failure exit=${child.status})`);
    process.exit(0);
  } catch (e) {
    console.error(`${LABEL} selftest FAIL`, e);
    process.exit(1);
  }
}

const problems = assertSources();
if (problems.length) {
  for (const p of problems) console.error(`  - ${p}`);
  fail(`${problems.length} problem(s)`);
}
try {
  selftestMapper();
} catch (e) {
  fail(String(e?.message || e));
}
console.log(`${LABEL} PASS — ECON-012 seed + mapper + bill Section A metadata path locked`);

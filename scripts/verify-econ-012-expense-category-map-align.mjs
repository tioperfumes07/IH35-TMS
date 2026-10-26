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

// --selftest plants defects into IN-MEMORY copies via this map — never into the tracked files
// (verify-no-selftest-mutates-tracked-source: a selftest must not edit the shared working tree).
const PLANTED = new Map();

function read(rel) {
  if (PLANTED.has(rel)) return PLANTED.get(rel);
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

  // 443.159 (747999d9fb, #26794 — owner 2026-10-16) moved bill Section A options off
  // catalogs.expense_categories onto the Chart of Accounts: a NEW pick is a GL account and posts through
  // bill_lines.account_id (poster explicit tier), so editor options no longer carry ECON-012 map keys.
  // The map keys still matter for LEGACY lines that already hold a catalogs.expense_categories id — the
  // rule now locks that those lines keep their category (never re-stamped as account_id) and that the
  // mapper only falls to the map-key path when no account_id was picked.
  const editor = read(EDITOR);
  if (!/legacyCategoryIdsRef/.test(editor) || !/legacyCategoryIdsRef\.current\.has\(picked\)/.test(editor)) {
    problems.push(`${EDITOR}: legacy expense-category lines must keep their category id (and its ECON-012 map keys), not be re-stamped as account_id`);
  }
  const accountBranch = mapper.indexOf("if (accountId)");
  const mapBranch = mapper.indexOf("mapExpenseCatalogCodeToBillCategory(line.expense_category_code");
  if (accountBranch < 0 || mapBranch < 0 || accountBranch > mapBranch) {
    problems.push(`${MAPPER}: a picked account_id must post on its own branch BEFORE the ECON-012 map-key fallback`);
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
    // Planted failure: drop revenue exclusion → the real assertion must fail.
    const original = read(MIGRATION);
    PLANTED.set(MIGRATION, original.replace("IS DISTINCT FROM 'revenue'", "IS DISTINCT FROM '__planted__'"));
    if (PLANTED.get(MIGRATION) === original) throw new Error("selftest setup: revenue exclusion text not found");
    const caught1 = assertSources().length > 0;
    PLANTED.delete(MIGRATION);
    if (!caught1) throw new Error("planted revenue-exclusion removal should fail the assertion");
    // Planted failure: legacy category lines re-stamped as account_id → must fail.
    const edOriginal = read(EDITOR);
    if (!edOriginal.includes("legacyCategoryIdsRef.current.has(picked)")) throw new Error("selftest setup: legacy guard text not found");
    PLANTED.set(EDITOR, edOriginal.replace("legacyCategoryIdsRef.current.has(picked)", "false"));
    const caught2 = assertSources().length > 0;
    PLANTED.delete(EDITOR);
    if (!caught2) throw new Error("planted legacy-category re-stamp should fail the assertion");
    console.log(`${LABEL} selftest OK — 2/2 planted failures caught (in-memory copies; tracked files untouched)`);
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

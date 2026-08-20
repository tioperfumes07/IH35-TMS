#!/usr/bin/env node
/**
 * VENDOR-PROFILE-AP-AGING-NO-GL-JE-LINK — the AP-aging vendor-bills drill must carry the bill's
 * posted-JE linkage end-to-end, and both consuming surfaces must render it.
 *
 * The gap this pins: vendors' profile.vendor leaf showed Built=100%/Live=0% on gl_je because
 * getApAgingBills' response had no journal_entry_id at all — nothing fetched, so no frontend
 * EntityLink was possible. Fix threads the CANONICAL bill→JE subquery (BILL_JOURNAL_ENTRY_ID_SQL /
 * BILL_JOURNAL_ENTRY_MEMO_SQL from bills.service.ts — reuse, never a duplicate join) through BOTH
 * branches (historical + live) of getApAgingVendorBills, the row mapping, the FE API type, and both
 * consumers (VendorApAgingSection + finance/ArApAgingPage's AP drill).
 *
 * Run:  node scripts/verify-ap-aging-bills-gl-je-link.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ap-aging-bills-gl-je-link";

const BE = "apps/backend/src/accounting/fin20-aging.service.ts";
const API = "apps/frontend/src/api/arApAging.ts";
const VENDOR = "apps/frontend/src/pages/vendors/VendorApAgingSection.tsx";
const FINANCE = "apps/frontend/src/pages/finance/ArApAgingPage.tsx";

export function analyze(files) {
  const failures = [];
  const be = files[BE];
  const idUses = (be.match(/\$\{BILL_JOURNAL_ENTRY_ID_SQL\} AS journal_entry_id/g) ?? []).length;
  if (idUses < 2) {
    failures.push(`${BE}: BILL_JOURNAL_ENTRY_ID_SQL must be projected in BOTH the historical and live branches of getApAgingVendorBills (found ${idUses}) — the canonical bill→JE subquery, never a duplicate join.`);
  }
  if (!/journal_entry_id: r\.journal_entry_id == null \? null : String\(r\.journal_entry_id\)/.test(be)) {
    failures.push(`${BE}: getApAgingVendorBills' row mapping must carry journal_entry_id (nullable).`);
  }
  if (!/journal_entry_id: string \| null;/.test(be)) {
    failures.push(`${BE}: ApAgingBillRow must declare journal_entry_id: string | null.`);
  }
  if (!/journal_entry_id: string \| null;/.test(files[API])) {
    failures.push(`${API}: the FE ApAgingBillRow type must declare journal_entry_id: string | null — without it no surface can render the drill.`);
  }
  if (!/journal_entry_id[\s\S]{0,400}?kind="journal_entry"/.test(files[VENDOR])) {
    failures.push(`${VENDOR}: the vendor-profile AP-aging section must render EntityLink kind="journal_entry" when journal_entry_id is present (the gl_je Built gap this guard exists for).`);
  }
  if (!/journal_entry_id[\s\S]{0,600}?kind="journal_entry"/.test(files[FINANCE])) {
    failures.push(`${FINANCE}: the finance AP drill (AP_DRILL_COLUMNS) must render the same journal_entry EntityLink — shared response, shared drill.`);
  }
  return failures;
}

function readAll() {
  const files = {};
  for (const f of [BE, API, VENDOR, FINANCE]) files[f] = fs.readFileSync(path.join(ROOT, f), "utf8");
  return files;
}

if (process.argv.includes("--selftest")) {
  const real = readAll();
  const good = analyze(real);
  if (good.length) throw new Error(`[${LABEL}] selftest: the REAL files should PASS but failed: ${good.join("; ")}`);

  // Mutation 1 — drop the live-branch projection (backend regression).
  const m1 = { ...real, [BE]: real[BE].replace(/\$\{BILL_JOURNAL_ENTRY_ID_SQL\} AS journal_entry_id,\n {14}\$\{BILL_JOURNAL_ENTRY_MEMO_SQL\}/, "${BILL_JOURNAL_ENTRY_MEMO_SQL}") };
  const f1 = analyze(m1);
  if (!f1.some((f) => f.includes("BOTH the historical and live branches"))) {
    throw new Error(`[${LABEL}] selftest: dropped live-branch projection should FAIL but got: ${f1.join("; ") || "(clean)"}`);
  }

  // Mutation 2 — strip the vendor-profile EntityLink (the original defect shape).
  const m2 = { ...real, [VENDOR]: real[VENDOR].replace(/kind="journal_entry"/g, 'kind="bill"') };
  const f2 = analyze(m2);
  if (!f2.some((f) => f.includes("vendor-profile AP-aging section"))) {
    throw new Error(`[${LABEL}] selftest: stripped vendor JE link should FAIL but got: ${f2.join("; ") || "(clean)"}`);
  }

  // Mutation 3 — remove the FE type field (silently un-fetches the linkage).
  const m3 = { ...real, [API]: real[API].replace(/ {2}journal_entry_id: string \| null;\n/, "") };
  const f3 = analyze(m3);
  if (!f3.some((f) => f.includes("FE ApAgingBillRow type"))) {
    throw new Error(`[${LABEL}] selftest: removed FE type field should FAIL but got: ${f3.join("; ") || "(clean)"}`);
  }

  console.log(`[${LABEL}] selftest: PASS — real green; live-branch, vendor-link and FE-type mutations all red`);
  process.exit(0);
}

const failures = analyze(readAll());
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — AP-aging bills carry the canonical bill→JE linkage in both branches and both surfaces render the drill`);

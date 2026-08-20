#!/usr/bin/env node
/**
 * HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID —
 *
 * ROOT CAUSE: driver_finance.settlement_lines (line_type='deduction') rows are generated FROM a
 * driver_finance.driver_settlement_deductions row by settlement-deduction-cap.service.ts, but the
 * INSERT never recorded which deduction produced the line. HoldDeductionModal.tsx therefore sent
 * the settlement-LINE's own id to PATCH /api/v1/driver-finance/deduction-schedules/:id/hold, which
 * updates driver_finance.deduction_schedule — an entirely different table (cash-advance/liability
 * recurring schedules, never wired into the settlement engine). Disjoint id spaces from disjoint
 * INSERT statements can never match, so Hold was broken by construction.
 *
 * FIX: the apply engine stamps the table's own generic source_table/source_reference_id linkage
 * (added 202607430000, never previously populated); the settlement-detail GET joins
 * driver_finance.driver_settlement_deductions through it and exposes source_deduction_id + real
 * is_held state; two new PATCH routes (/settlement-deductions/:id/hold|resume) target the real
 * table; the frontend sends deduction.source_deduction_id, not deduction.id, and only offers Hold
 * when a real linked record exists.
 *
 * Usage: node scripts/verify-hold-deduction-real-target.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hold-deduction-real-target";

const FILES = {
  deductionsService: "apps/backend/src/driver-finance/deductions.service.ts",
  capService: "apps/backend/src/driver-finance/settlement-deduction-cap.service.ts",
  settlementsRoutes: "apps/backend/src/driver-finance/settlements.routes.ts",
  deductionsRoutes: "apps/backend/src/driver-finance/deductions.routes.ts",
  modal: "apps/frontend/src/pages/driver-finance/components/HoldDeductionModal.tsx",
  section: "apps/frontend/src/pages/driver-finance/components/DeductionsSection.tsx",
  detailPage: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
  migration: "db/migrations/202612550000_hold_deduction_real_target.sql",
};

export function checkAll(readFile) {
  const failures = [];
  const read = (rel) => {
    const src = readFile(rel);
    if (src === null) failures.push(`${rel}: not found`);
    return src ?? "";
  };

  const svc = read(FILES.deductionsService);
  if (!/export const SETTLEMENT_DEDUCTION_SOURCE_TABLE/.test(svc)) {
    failures.push(`${FILES.deductionsService}: must export SETTLEMENT_DEDUCTION_SOURCE_TABLE (shared writer/reader constant)`);
  }

  const cap = read(FILES.capService);
  if (!/SETTLEMENT_DEDUCTION_SOURCE_TABLE/.test(cap) || !/source_reference_id/.test(cap)) {
    failures.push(`${FILES.capService}: settlement_lines INSERT must stamp source_table/source_reference_id back to the originating deduction`);
  }

  const routes = read(FILES.settlementsRoutes);
  if (!/LEFT JOIN driver_finance\.driver_settlement_deductions dsd/.test(routes)) {
    failures.push(`${FILES.settlementsRoutes}: GET settlement detail must join driver_settlement_deductions via source_reference_id`);
  }
  if (!/dsd\.is_held AS deduction_is_held/.test(routes)) {
    failures.push(`${FILES.settlementsRoutes}: must expose the REAL is_held state, not a column that never existed on settlement_lines`);
  }

  const dr = read(FILES.deductionsRoutes);
  if (!/\/api\/v1\/driver-finance\/settlement-deductions\/:id\/hold/.test(dr)) {
    failures.push(`${FILES.deductionsRoutes}: missing /settlement-deductions/:id/hold route (the real target)`);
  }
  if (!/\/api\/v1\/driver-finance\/settlement-deductions\/:id\/resume/.test(dr)) {
    failures.push(`${FILES.deductionsRoutes}: missing /settlement-deductions/:id/resume route`);
  }
  if (!/UPDATE driver_finance\.driver_settlement_deductions/.test(dr)) {
    failures.push(`${FILES.deductionsRoutes}: new hold/resume routes must UPDATE driver_settlement_deductions, not deduction_schedule`);
  }

  const modal = read(FILES.modal);
  if (!/holdSettlementDeduction/.test(modal)) {
    failures.push(`${FILES.modal}: must call holdSettlementDeduction, not the deduction_schedule-targeting holdDeduction`);
  }
  if (!/deduction\.source_deduction_id/.test(modal)) {
    failures.push(`${FILES.modal}: must PATCH deduction.source_deduction_id, not deduction.id (the settlement-line id)`);
  }

  const section = read(FILES.section);
  if (!/source_deduction_id/.test(section)) {
    failures.push(`${FILES.section}: Hold button must gate on source_deduction_id presence (no real record = no Hold)`);
  }
  if (!/EntityLinkOrTombstone[\s\S]{0,180}kind="user"[\s\S]{0,120}id=\{row\.held_by_user_id\}[\s\S]{0,120}name=\{row\.held_by_user\}[\s\S]{0,80}noun="User"/.test(section)) {
    failures.push(`${FILES.section}: held-by user identity must keep unresolved users as non-clickable tombstones`);
  }

  const detail = read(FILES.detailPage);
  if (!/source_deduction_id: line\.source_deduction_id/.test(detail)) {
    failures.push(`${FILES.detailPage}: toDeductionRows must map source_deduction_id from the API response`);
  }

  const migration = readFile(FILES.migration);
  if (migration === null) {
    failures.push(`${FILES.migration}: missing — driver_settlement_deductions needs is_held/hold_until_period/hold_reason/held_by_user_id columns for the new hold routes to write to`);
  } else {
    for (const col of ["is_held", "hold_until_period", "hold_reason", "held_by_user_id"]) {
      if (!migration.includes(`ADD COLUMN IF NOT EXISTS ${col}`)) {
        failures.push(`${FILES.migration}: missing idempotent ADD COLUMN for ${col}`);
      }
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    [FILES.deductionsService]: "export const SETTLEMENT_DEDUCTION_SOURCE_TABLE = \"driver_finance.driver_settlement_deductions\";",
    [FILES.capService]: "SETTLEMENT_DEDUCTION_SOURCE_TABLE, source_reference_id",
    [FILES.settlementsRoutes]:
      "LEFT JOIN driver_finance.driver_settlement_deductions dsd\n dsd.is_held AS deduction_is_held",
    [FILES.deductionsRoutes]:
      'app.patch("/api/v1/driver-finance/settlement-deductions/:id/hold" app.patch("/api/v1/driver-finance/settlement-deductions/:id/resume" UPDATE driver_finance.driver_settlement_deductions',
    [FILES.modal]: "holdSettlementDeduction(deduction.source_deduction_id, ...)",
    [FILES.section]: 'row.source_deduction_id <EntityLinkOrTombstone kind="user" id={row.held_by_user_id} name={row.held_by_user} noun="User" />',
    [FILES.detailPage]: "source_deduction_id: line.source_deduction_id ? String(line.source_deduction_id) : null,",
    [FILES.migration]:
      "ADD COLUMN IF NOT EXISTS is_held\nADD COLUMN IF NOT EXISTS hold_until_period\nADD COLUMN IF NOT EXISTS hold_reason\nADD COLUMN IF NOT EXISTS held_by_user_id",
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length < Object.keys(GOOD_FIXTURES).length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should trip every file's check`);
    process.exit(1);
  }
  // Targeted regression: reverting ONLY the modal back to the old wrong-target call must be caught.
  const modalRegressed = checkAll((f) =>
    f === FILES.modal ? "holdDeduction(deduction.id, operatingCompanyId, payload)" : (GOOD_FIXTURES[f] ?? null)
  );
  if (!modalRegressed.some((f) => f.includes(FILES.modal))) {
    console.error(`[${LABEL}] selftest FAIL: modal reverting to holdDeduction(deduction.id, ...) must be caught`);
    process.exit(1);
  }
  const heldByRegressed = checkAll((f) =>
    f === FILES.section
      ? 'row.source_deduction_id <EntityLink kind="user" id={row.held_by_user_id} label={row.held_by_user ?? "user"} />'
      : (GOOD_FIXTURES[f] ?? null)
  );
  if (!heldByRegressed.some((f) => f.includes(FILES.section))) {
    console.error(`[${LABEL}] selftest FAIL: held-by user reverting to a clickable unresolved label must be caught`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed/targeted-regression fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — Hold Deduction targets the real driver_settlement_deductions row, not a wrong-table settlement-line id`);

#!/usr/bin/env node
/**
 * CATALOG-ACCOUNTING-CREATE-PICKER-LAW-OVERCLAIM — picker_law Required-column honesty
 * correction, accounting catalog-create remainder (2 batches).
 *
 * 10 `catalog.accounting.*.create` leaves in the Lists module claimed picker_law as Required
 * even though their create forms carry zero cross-catalog reference fields (live DOM read,
 * schema grep for `uuid REFERENCES` columns, and — batch 2 — the actual backend registration
 * factory in apps/backend/src/catalogs/accounting/index.ts, which proves several of these
 * route through a generic zero-FK factory with no metadata support at all), or have no create
 * form to begin with (readOnly on both FE and BE, or the same disposition their own
 * already-dropped connectivity requirement documents). See
 * docs/specs/scoreboard/modules/lists.required.json's
 * honesty_audit.picker_law_column_2026_08_18_accounting_remainder (batch 1) and
 * .../_batch2 (batch 2) for the full per-leaf evidence. Does NOT touch chart_of_accounts.create
 * / detail_types*.create (a real cross-catalog reference, genuine gap) or
 * payment_methods.create (an owned_surface_paths pointer to a DIFFERENT, richer picker
 * component with a real gl_account_id FK contradicts the flat-factory signal — stays Required
 * pending its own dedicated investigation) — this guard fails if any of those four are
 * accidentally swept in.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lists-accounting-picker-law-honest";
const SELFTEST = process.argv.includes("--selftest");
const REQUIRED_FILE = "docs/specs/scoreboard/modules/lists.required.json";

const DROPPED = [
  "catalog.accounting.account_types_lookup.create",
  "catalog.accounting.payment_terms.create",
  "catalog.accounting.void_cancel_reasons.create",
  "catalog.accounting.account_types.create",
  "catalog.accounting.audit_event_types.create",
  "catalog.accounting.account_role_bindings.create",
  "catalog.accounting.chart_of_accounts_seeds.create",
  "catalog.accounting.expense_categories.create",
  "catalog.accounting.tax_codes.create",
  "catalog.accounting.currency_codes.create",
];

// These stay Required for picker_law — a mutation of these must NOT be caught by this guard,
// which would mean the guard is over-broad and would silently pass if someone accidentally
// dropped picker_law from a leaf that genuinely needs it.
const MUST_STAY_REQUIRED = [
  "catalog.accounting.chart_of_accounts.create",
  "catalog.accounting.detail_types.create",
  "catalog.accounting.detail_types_lookup.create",
  "catalog.accounting.payment_methods.create",
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

export function assertPickerLawHonest(doc) {
  const problems = [];
  for (const id of DROPPED) {
    const leaf = (doc.leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${id} missing from required.json`); continue; }
    if ((leaf.required || []).includes("picker_law")) problems.push(`${id} must not require picker_law`);
  }
  for (const id of MUST_STAY_REQUIRED) {
    const leaf = (doc.leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${id} missing from required.json`); continue; }
    if (!(leaf.required || []).includes("picker_law")) problems.push(`${id} must still require picker_law`);
  }
  return problems;
}

function selftest() {
  const doc = readJson(REQUIRED_FILE);

  const goodProblems = assertPickerLawHonest(doc);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  let mutationCount = 0;
  for (const id of DROPPED) {
    mutationCount++;
    const mutated = structuredClone(doc);
    const leaf = mutated.leaves.find((l) => l.id === id);
    leaf.required = [...new Set([...(leaf.required || []), "picker_law"])];
    if (assertPickerLawHonest(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add picker_law to ${id}`);
      process.exit(1);
    }
  }
  for (const id of MUST_STAY_REQUIRED) {
    mutationCount++;
    const mutated = structuredClone(doc);
    const leaf = mutated.leaves.find((l) => l.id === id);
    leaf.required = (leaf.required || []).filter((r) => r !== "picker_law");
    if (assertPickerLawHonest(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: drop picker_law from ${id} unnoticed`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const liveDoc = readJson(REQUIRED_FILE);
const failures = assertPickerLawHonest(liveDoc);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);

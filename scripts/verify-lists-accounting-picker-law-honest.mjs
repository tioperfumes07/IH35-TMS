#!/usr/bin/env node
/** @ratchet — preserves an audited Required-column decision; never picker product or Live proof. */
/**
 * CATALOG-ACCOUNTING-CREATE-PICKER-LAW-OVERCLAIM — picker_law Required-column honesty
 * correction, accounting catalog-create remainder (3 batches — this closes the class).
 *
 * 13 `catalog.accounting.*.create` leaves in the Lists module claimed picker_law as Required
 * even though their create forms carry zero cross-catalog reference fields (live DOM read,
 * schema grep for `uuid REFERENCES` columns, the actual backend registration factory in
 * apps/backend/src/catalogs/accounting/index.ts and factory.ts, which proves several of these
 * route through a generic zero-FK factory with no metadata support at all), have no create
 * form to begin with (readOnly on both FE and BE), or are not a "create a new catalog row"
 * feature at all (qbo_bulk_link is a bulk QBO-matching wizard against EXISTING records;
 * abandonment_defaults is a single-row settings upsert). See
 * docs/specs/scoreboard/modules/lists.required.json's
 * honesty_audit.picker_law_column_2026_08_18_accounting_remainder (batch 1), .../_batch2
 * (batch 2), .../_batch3 (batch 3) and .../_final_confirmation for the full per-leaf evidence.
 * Does NOT touch chart_of_accounts.create (a genuine gap, now FIXED — see ACCT-F5427) or the 6
 * leaves confirmed already code-compliant via a real picker component and correctly left
 * Required: journal_entry_types.create (JournalEntryTypePicker.tsx), posting_templates.create
 * (PostingTemplateModal.tsx), items.create (ItemEditorModal.tsx), payment_methods.create
 * (PaymentMethodPicker.tsx — the owned_surface_paths pointer that looked contradictory in batch
 * 2 turned out to be the correct, already-built surface), and detail_types.create /
 * detail_types_lookup.create (SelectCombobox with no allowAddNew — correct, since their own
 * Account Type field is an explicitly fixed/read-only taxonomy with no create affordance to
 * omit). All 7 need only a live-proof pass, not a fix. This guard fails if any of those seven
 * are accidentally swept into DROPPED.
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
  "catalog.accounting.qbo_categories.create",
  "catalog.accounting.qbo_bulk_link.create",
  "catalog.accounting.abandonment_defaults.create",
];

// These stay Required for picker_law — a mutation of these must NOT be caught by this guard,
// which would mean the guard is over-broad and would silently pass if someone accidentally
// dropped picker_law from a leaf that genuinely needs it.
const MUST_STAY_REQUIRED = [
  "catalog.accounting.chart_of_accounts.create",
  "catalog.accounting.detail_types.create",
  "catalog.accounting.detail_types_lookup.create",
  "catalog.accounting.journal_entry_types.create",
  "catalog.accounting.posting_templates.create",
  "catalog.accounting.items.create",
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

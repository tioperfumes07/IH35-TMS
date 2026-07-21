#!/usr/bin/env node
/**
 * verify-factor-admin-uses-paritytable — FactorAdmin.tsx (factoring, financial surface)
 *
 * Display-only ParityTable migration of the three hand-rolled tables (factors list,
 * assignment history, batch history). Financial-surface constraints locked in:
 *  - rate formatting stays formatPct (advance/fee/reserve percentages 1:1);
 *  - column labels/order preserved for all three tables;
 *  - settled-only empty texts (LIST-EMPTY-1) preserved verbatim;
 *  - ListErrorState surfaces query errors (never collapsed into empty);
 *  - factor mutations (create/assign/deactivate/NOA/LOR) remain — the migration is
 *    list chrome only, so the single-factor invariant path (WF-017) is untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factor-admin-uses-paritytable";
const PAGE = "apps/frontend/src/pages/factoring/FactorAdmin.tsx";

const REQUIRED_LABELS = [
  // factors table
  "Name",
  "Advance Rate",
  "Fee Rate",
  "Reserve Rate",
  "Recourse Days",
  "Active",
  "Updated",
  // assignment history
  "Factor",
  "Effective From",
  "Effective To",
  // batch history
  "Batch",
  "Status",
  "Submitted",
];

const REQUIRED_STORAGE_KEYS = [
  'storageKey="factor-admin-factors"',
  'storageKey="factor-admin-assignments"',
  'storageKey="factor-admin-batches"',
];

const REQUIRED_TEST_IDS = [
  'tableTestId="factor-admin-factors-table"',
  'tableTestId="factor-admin-assignments-table"',
  'tableTestId="factor-admin-batches-table"',
];

const REQUIRED_EMPTY_TEXTS = [
  "No factors configured yet.",
  "No assignments found for this factor/customer.",
  "No batch history for this customer.",
];

// Display-only migration must NOT strip the existing factor admin actions
// (they carry the WF-017 single-factor invariant path server-side).
const REQUIRED_ACTION_IMPORTS = [
  "assignCustomerFactor",
  "createFactor",
  "createLetterOfRelease",
  "deactivateFactor",
  "updateFactor",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 3) {
    errors.push(`${PAGE}: expected ≥3 <ParityTable> (factors, assignments, batches)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  for (const key of REQUIRED_STORAGE_KEYS) {
    if (!src.includes(key)) errors.push(`${PAGE}: missing ${key}`);
  }
  for (const id of REQUIRED_TEST_IDS) {
    if (!src.includes(id)) errors.push(`${PAGE}: missing ${id}`);
  }
  for (const text of REQUIRED_EMPTY_TEXTS) {
    if (!src.includes(text)) {
      errors.push(`${PAGE}: must keep the settled-only empty text (LIST-EMPTY-1 literal): "${text}"`);
    }
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must surface query errors via ListErrorState`);
  }
  if (!src.includes("formatPct")) {
    errors.push(`${PAGE}: must keep formatPct rate formatting (financial display 1:1)`);
  }
  for (const action of REQUIRED_ACTION_IMPORTS) {
    if (!src.includes(action)) {
      errors.push(`${PAGE}: display-only migration must not remove action "${action}" (WF-017 path)`);
    }
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    import { assignCustomerFactor, createFactor, createLetterOfRelease, deactivateFactor, updateFactor } from "../../api/factoring";
    function formatPct(v) { return v; }
    const FACTOR_COLUMNS = [
      { key: "name", label: "Name" },
      { key: "advance_rate", label: "Advance Rate" },
      { key: "fee_rate", label: "Fee Rate" },
      { key: "reserve_rate", label: "Reserve Rate" },
      { key: "recourse_days", label: "Recourse Days" },
      { key: "active", label: "Active" },
      { key: "updated_at", label: "Updated" },
    ];
    const ASSIGNMENT_COLUMNS = [
      { key: "factor_name", label: "Factor" },
      { key: "effective_from", label: "Effective From" },
      { key: "effective_to", label: "Effective To" },
    ];
    const BATCH_COLUMNS = [
      { key: "batch_number", label: "Batch" },
      { key: "status", label: "Status" },
      { key: "submitted_at", label: "Submitted" },
    ];
    <ListErrorState onRetry={() => {}} />
    <ParityTable storageKey="factor-admin-factors" tableTestId="factor-admin-factors-table" emptyText="No factors configured yet." />
    <ParityTable storageKey="factor-admin-assignments" tableTestId="factor-admin-assignments-table" emptyText="No assignments found for this factor/customer." />
    <ParityTable storageKey="factor-admin-batches" tableTestId="factor-admin-batches-table" emptyText="No batch history for this customer." />
  `;
  const bad = `
    export function FactorAdmin() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Name</th></tr></thead>
        </table>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable ×3; columns/rates/empty texts/error surface preserved; actions intact.`,
  );
}

main();

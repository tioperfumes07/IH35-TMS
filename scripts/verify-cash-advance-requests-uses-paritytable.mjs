#!/usr/bin/env node
/**
 * verify-cash-advance-requests-uses-paritytable — qbo-parity-a1 (CashAdvanceRequestsPage surface)
 *
 * Financial surface — UI-only ParityTable migration (owner greenlit, display-only). The pending
 * cash-advance-requests grid must use shared ParityTable grammar (sort/resize/gear), not a
 * hand-rolled <table>. Load failures must surface ListErrorState (never a false-empty list).
 * Inline Approve/Escalate/Deny action buttons stay inside cell renderers with handlers unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-advance-requests-uses-paritytable";
const PAGE = "apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx";

const REQUIRED_LABELS = ["Request", "Driver", "Amount", "Policy", "Submitted", "Notes", "Actions"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("from '../../components/parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="driver-finance-cash-advance-requests"')) {
    errors.push(`${PAGE}: must set storageKey="driver-finance-cash-advance-requests"`);
  }
  if (!src.includes('tableTestId="cash-advance-requests-parity"')) {
    errors.push(`${PAGE}: must set tableTestId="cash-advance-requests-parity"`);
  }
  if (!src.includes("No pending requests.")) {
    errors.push(`${PAGE}: must keep emptyText "No pending requests."`);
  }
  if (!src.includes("formatUsdFromCents(row.requested_amount_cents)")) {
    errors.push(`${PAGE}: must keep formatUsdFromCents amount rendering (display-only invariant)`);
  }
  // Money-adjacent inline action buttons must stay inside cell renderers, handlers unchanged.
  if (!src.includes("approveMut.mutate(row)")) {
    errors.push(`${PAGE}: must keep inline Approve action (approveMut.mutate(row))`);
  }
  if (!src.includes("escalateMut.mutate(row)")) {
    errors.push(`${PAGE}: must keep inline Escalate action (escalateMut.mutate(row))`);
  }
  if (!src.includes("setDenyForId(id)")) {
    errors.push(`${PAGE}: must keep inline Deny action (setDenyForId)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const columns = [
      { key: "display_id", label: "Request" },
      { key: "driver_name", label: "Driver" },
      { key: "requested_amount_cents", label: "Amount", render: (row) => formatUsdFromCents(row.requested_amount_cents) },
      { key: "policy", label: "Policy" },
      { key: "submitted_at", label: "Submitted" },
      { key: "notes", label: "Notes" },
      { key: "actions", label: "Actions", render: (row) => (
        <>
          <Button onClick={() => approveMut.mutate(row)}>Approve</Button>
          <Button onClick={() => escalateMut.mutate(row)}>Escalate to Owner</Button>
          <Button onClick={() => setDenyForId(id)}>Deny</Button>
        </>
      ) },
    ];
    <ListErrorState title="Could not load requests." status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="driver-finance-cash-advance-requests"
      tableTestId="cash-advance-requests-parity"
      emptyText="No pending requests."
    />
  `;
  const bad = `
    export function CashAdvanceRequestsPage() {
      return (
        <div>
          <table><thead><tr><th>Request</th></tr></thead></table>
        </div>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns, USD formatting, and inline actions preserved.`);
}

main();

#!/usr/bin/env node
/**
 * verify-setl-users-paritytable — Settlements + Users primary list tables (verify-step 2010)
 *
 * Non-financial UI-only ParityTable migration: driver-finance SettlementsTable and identity
 * Users list must use shared ParityTable with enableColumnResize (adjustable-columns law),
 * not hand-rolled <table> or legacy DataTable with zero resizable columns.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-setl-users-paritytable";
const SETTLEMENTS = "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx";
const USERS = "apps/frontend/src/pages/Users.tsx";

const SETTLEMENT_LABELS = ["Driver", "Period", "Loads", "Gross", "Deductions", "Net Pay", "Status", "Debt Flag", "Action"];
const USER_LABELS = ["Name", "Email", "Role", "Status", "Auth method", "Last Login", "Actions"];

function assertSettlements(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${SETTLEMENTS}: must import and render ParityTable`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${SETTLEMENTS}: must not contain hand-rolled <table>`);
  }
  if (src.includes("TableHeaderCell")) {
    errors.push(`${SETTLEMENTS}: must not use TableHeaderCell after ParityTable migration`);
  }
  if (!src.includes('storageKey="driver-finance-settlements-list"')) {
    errors.push(`${SETTLEMENTS}: must set storageKey="driver-finance-settlements-list"`);
  }
  if (!src.includes('tableTestId="driver-finance-settlements-table"')) {
    errors.push(`${SETTLEMENTS}: must set tableTestId="driver-finance-settlements-table"`);
  }
  if (!/enableColumnResize/.test(src)) {
    errors.push(`${SETTLEMENTS}: must enable column resize (enableColumnResize)`);
  }
  if (!src.includes("useUrlSort")) {
    errors.push(`${SETTLEMENTS}: must persist sort via useUrlSort (?sort=/?dir=)`);
  }
  if (!src.includes("No settlements found.")) {
    errors.push(`${SETTLEMENTS}: must keep emptyText "No settlements found."`);
  }
  if (!/\bload_count\b/.test(src)) {
    errors.push(`${SETTLEMENTS}: Loads column must bind row.load_count (no phantom placeholder)`);
  }
  if (!src.includes("EntityLink")) {
    errors.push(`${SETTLEMENTS}: Driver cell must keep EntityLink drill-down`);
  }
  for (const label of SETTLEMENT_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${SETTLEMENTS}: missing column label: "${label}"`);
    }
  }
  return errors;
}

function assertUsers(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${USERS}: must import and render ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${USERS}: must not import or render DataTable after ParityTable migration`);
  }
  if (src.includes("TableSelection")) {
    errors.push(`${USERS}: bulk selection must use ParityTable selectable (not TableSelection wrapper)`);
  }
  if (!src.includes('storageKey="users-list"')) {
    errors.push(`${USERS}: must set storageKey="users-list"`);
  }
  if (!src.includes('tableTestId="users-list-table"')) {
    errors.push(`${USERS}: must set tableTestId="users-list-table"`);
  }
  if (!/enableColumnResize/.test(src)) {
    errors.push(`${USERS}: must enable column resize (enableColumnResize)`);
  }
  if (!src.includes("useUrlSort")) {
    errors.push(`${USERS}: must persist sort via useUrlSort (?sort=/?dir=)`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${USERS}: must render ListErrorBanner on query error`);
  }
  if (!src.includes("selectable")) {
    errors.push(`${USERS}: must keep row selection via ParityTable selectable`);
  }
  if (!src.includes("handleExportSelected")) {
    errors.push(`${USERS}: must preserve Export Selected CSV handler`);
  }
  if (!src.includes("Change Role")) {
    errors.push(`${USERS}: must preserve per-row Change Role action`);
  }
  if (!src.includes("Deactivate")) {
    errors.push(`${USERS}: must preserve per-row Deactivate action`);
  }
  for (const label of USER_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${USERS}: missing column label: "${label}"`);
    }
  }
  return errors;
}

function selftest() {
  const goodSettlements = `
    import { ParityTable } from "../../../components/parity/ParityTable";
    import { EntityLink } from "../../../components/shared/EntityLink";
    import { useUrlSort } from "../../../hooks/useUrlSort";
    const columns = [
      { key: "driver", label: "Driver" },
      { key: "period", label: "Period" },
      { key: "loads", label: "Loads", render: (row) => Number(row.load_count ?? 0) },
      { key: "gross", label: "Gross" },
      { key: "deductions", label: "Deductions" },
      { key: "net_pay", label: "Net Pay" },
      { key: "status", label: "Status" },
      { key: "debt_flag", label: "Debt Flag" },
      { key: "action", label: "Action" },
    ];
    <ParityTable storageKey="driver-finance-settlements-list" tableTestId="driver-finance-settlements-table" enableColumnResize emptyText="No settlements found." />
  `;
  const goodUsers = `
    import { ParityTable } from "../components/parity/ParityTable";
    import { ListErrorBanner } from "../components/shared/ListErrorBanner";
    import { useUrlSort } from "../hooks/useUrlSort";
    const userColumns = [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "role", label: "Role" },
      { key: "status", label: "Status" },
      { key: "auth_method", label: "Auth method" },
      { key: "last_login", label: "Last Login" },
      { key: "actions", label: "Actions" },
    ];
    <ListErrorBanner onRetry={() => {}} />
    <ParityTable storageKey="users-list" tableTestId="users-list-table" enableColumnResize selectable handleExportSelected Change Role Deactivate />
  `;
  const bad = `
    import { DataTable } from "../components/DataTable";
    import { TableSelection } from "../components/bulk/TableSelection";
    export function UsersPage() {
      return <table><thead><tr><th>Name</th></tr></thead></table>;
    }
  `;
  const goodErrors = [...assertSettlements(goodSettlements), ...assertUsers(goodUsers)];
  const badErrors = [...assertSettlements(bad), ...assertUsers(bad)];
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 4) {
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
  const settlementsSrc = fs.readFileSync(path.join(ROOT, SETTLEMENTS), "utf8");
  const usersSrc = fs.readFileSync(path.join(ROOT, USERS), "utf8");
  const errors = [...assertSettlements(settlementsSrc), ...assertUsers(usersSrc)];
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: SettlementsTable + Users list use ParityTable with enableColumnResize; columns and behaviors preserved.`);
}

main();

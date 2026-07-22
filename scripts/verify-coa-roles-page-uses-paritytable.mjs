#!/usr/bin/env node
/**
 * verify-coa-roles-page-uses-paritytable — qbo-parity-a1 (CoaRolesPage surface)
 *
 * The CoA roles binding page (money-adjacent catalog/config) must render its role list through
 * the shared ParityTable grammar, not a hand-rolled <table>. DISPLAY-ONLY migration: the
 * per-row account <select> (value=uuid, label=account name — never render a raw uuid) and the
 * Save button (upsertCoaRole mutation) keep their handlers; the rowsQuery ListErrorState and
 * the validateQuery ListErrorBanner error surfaces are preserved
 * (verify-accounting-query-error-states / verify-list-error-state-coverage companions).
 * No posting/GL logic lives on this page and none may be added.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-coa-roles-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/CoaRolesPage.tsx";

const REQUIRED_LABELS = ["Role", "Account", "Status", "Updated", "Action"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
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
  if (!src.includes('storageKey="accounting-coa-roles"')) {
    errors.push(`${PAGE}: must set storageKey="accounting-coa-roles"`);
  }
  if (!src.includes('tableTestId="coa-roles-table"')) {
    errors.push(`${PAGE}: must set tableTestId="coa-roles-table"`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must keep ListErrorState for the rowsQuery error surface`);
  }
  if (!src.includes("validateQuery.isError ? (")) {
    errors.push(`${PAGE}: must keep the validateQuery error banner (accounting-query-error-states literal)`);
  }
  if (!src.includes("upsertMutation.mutate({ role: row.role, account_id: value })")) {
    errors.push(`${PAGE}: must keep the per-row Save handler (upsertCoaRole mutation) unchanged`);
  }
  // Datalist showed option VALUE (uuid) as the control text — forbidden. Select keeps uuid as
  // value= but renders account_name as the visible label.
  if (!src.includes("<select") || !src.includes("value={account.id}") || !src.includes("{account.account_name}")) {
    errors.push(`${PAGE}: must use a <select> account picker (value=uuid, label=account_name)`);
  }
  if (src.includes("datalist") || src.includes("coa-role-account-options-")) {
    errors.push(`${PAGE}: must not use datalist account picker (renders uuid as the control value)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    const columns = [
      { key: "role", label: "Role" },
      { key: "account_id", label: "Account", render: (row) => (
        <select value={value}>
          <option value="">Select account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.account_name}</option>
          ))}
        </select> ) },
      { key: "is_active", label: "Status" },
      { key: "updated_at", label: "Updated" },
      { key: "action", label: "Action", render: (row) => (
        <Button onClick={() => upsertMutation.mutate({ role: row.role, account_id: value })}>Save</Button> ) },
    ];
    {validateQuery.isError ? (
      <ListErrorBanner onRetry={() => void validateQuery.refetch()} />
    ) : null}
    {rowsQuery.isError ? <ListErrorState /> : (
      <ParityTable storageKey="accounting-coa-roles" tableTestId="coa-roles-table" columns={columns} />
    )}
  `;
  const bad = `
    export function CoaRolesPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Role</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/editor handlers/error surfaces preserved.`);
}

main();

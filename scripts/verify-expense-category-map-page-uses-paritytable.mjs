#!/usr/bin/env node
/**
 * verify-expense-category-map-page-uses-paritytable — qbo-parity-a1 (ExpenseCategoryMapPage surface)
 *
 * Money-adjacent COA-mapping list (accounting/*, owner-greenlit UI-only migration) must use the
 * shared ParityTable grammar, not a hand-rolled <table>. DISPLAY-ONLY migration: the column set
 * (Kind / Code / Account / Side / Status / Audit / Actions), the settled-only empty text
 * "No mappings found." (LIST-EMPTY-1), the ListErrorState error surface on the map query, the
 * ListErrorBanner + accountsQuery retry in the add modal (wave-c), the inline Deactivate action
 * (soft delete via ConfirmModal — void, never delete), and the admin-activity audit link must all
 * be preserved. No posting/GL logic lives in this file's table; the create/deactivate mutations
 * are pre-existing modal/confirm flows and must remain untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-category-map-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx";

const REQUIRED_LABELS = ["Kind", "Code", "Account", "Side", "Status", "Audit", "Actions"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
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
  if (!src.includes('storageKey="accounting-expense-category-map"')) {
    errors.push(`${PAGE}: must set storageKey="accounting-expense-category-map"`);
  }
  if (!src.includes("No mappings found.")) {
    errors.push(`${PAGE}: must keep the settled-only empty text (LIST-EMPTY-1 guard literal)`);
  }
  if (!/\bloading=/.test(src)) {
    errors.push(`${PAGE}: ParityTable must receive the loading prop (settled-only empty gate)`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must keep ListErrorState error surface on the map query`);
  }
  if (!src.includes("ListErrorBanner") || !src.includes("accountsQuery.isError") || !/accountsQuery\.refetch\(\)/.test(src)) {
    errors.push(`${PAGE}: must keep ListErrorBanner + accountsQuery retry in the add modal (wave-c)`);
  }
  if (!src.includes("Deactivate") || !src.includes("setDeactivateTarget")) {
    errors.push(`${PAGE}: must keep the inline Deactivate action (handler unchanged, soft delete)`);
  }
  if (!src.includes("ConfirmModal")) {
    errors.push(`${PAGE}: must keep the deactivate ConfirmModal (void, never delete)`);
  }
  if (!src.includes("event_class=expense_category_map_change")) {
    errors.push(`${PAGE}: must keep the admin-activity audit drill-through link`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    import { ConfirmModal } from "../../components/shared/ConfirmModal";
    const COLUMNS = [
      { key: "category_kind", label: "Kind" },
      { key: "category_code", label: "Code" },
      { key: "account_number", label: "Account" },
      { key: "posting_side", label: "Side" },
      { key: "is_active", label: "Status" },
      { key: "audit", label: "Audit", render: (row) => <Link to={\`/admin/activity?event_class=expense_category_map_change&resource_id=\${row.id}\`}>View audit</Link> },
      { key: "actions", label: "Actions", render: (row) => <Button onClick={() => setDeactivateTarget(row.id)}>Deactivate</Button> },
    ];
    {accountsQuery.isError ? <ListErrorBanner onRetry={() => void accountsQuery.refetch()} /> : null}
    <ListErrorState title="Couldn't load category mappings" />
    <ParityTable
      loading={mapQuery.isLoading}
      storageKey="accounting-expense-category-map"
      emptyText="No mappings found."
    />
    <ConfirmModal open={Boolean(deactivateTarget)} />
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    export function ExpenseCategoryMapPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Kind</th></tr></thead>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable; columns/empty/error surfaces + Deactivate + audit link preserved; display-only.`,
  );
}

main();

#!/usr/bin/env node
/**
 * verify-recurring-bill-list-uses-paritytable — qbo-parity-a1 (RecurringBillList surface)
 *
 * Recurring bill templates list (/accounting/bills/recurring — an A/P money surface; the list
 * itself is read-only display, generation/deactivation post via existing mutations). Owner-greenlit
 * DISPLAY-ONLY migration: the templates grid must use the shared ParityTable grammar (sort /
 * resize / gear / pager) with the same 8 columns in the same order (Template Name / Vendor /
 * Frequency / Next Date / Amount / Auto-Post / Status / Actions), the money() USD amount
 * formatting, the vendor EntityLink, the Active/Inactive statusBadge, and the Generate-now (Zap) +
 * Deactivate (ToggleLeft) inline action buttons preserved 1:1 with their original mutation
 * handlers (deactivate stays behind the ConfirmModal soft-delete confirm). Query errors surface
 * ListErrorState (never a bare red banner); the "No recurring bill templates yet." empty CTA
 * stays. No hand-rolled <table> may remain, and no NEW mutations may be added beyond the two
 * pre-existing ones (generateRecurringBillNow, deactivateRecurringBillTemplate).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-recurring-bill-list-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx";

const REQUIRED_LABELS = [
  "Template Name",
  "Vendor",
  "Frequency",
  "Next Date",
  "Amount",
  "Auto-Post",
  "Status",
  "Actions",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable> (templates grid)`);
  }
  const handRolledTables = (src.match(/<table[\s>]/g) ?? []).length;
  if (handRolledTables > 0) {
    errors.push(`${PAGE}: expected 0 remaining hand-rolled <table>, found ${handRolledTables}`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing ParityTable column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="acct-recurring-bill-templates"')) {
    errors.push(`${PAGE}: must set storageKey="acct-recurring-bill-templates"`);
  }
  if (!src.includes('tableTestId="recurring-bill-templates-table"')) {
    errors.push(`${PAGE}: must set tableTestId="recurring-bill-templates-table"`);
  }
  if (!src.includes("money(") || !src.includes('currency: "USD"')) {
    errors.push(`${PAGE}: must keep the money() USD currency formatter for the Amount column (1:1)`);
  }
  if (!src.includes('kind="vendor"')) {
    errors.push(`${PAGE}: must keep the vendor EntityLink in the Vendor column`);
  }
  if (!src.includes("statusBadge(")) {
    errors.push(`${PAGE}: must keep the Active/Inactive statusBadge in the Status column`);
  }
  if (!src.includes("generateNowMutation") || !src.includes("<Zap")) {
    errors.push(`${PAGE}: must keep the Generate-now (Zap) inline action with its original handler`);
  }
  if (!src.includes("setDeactivateTarget") || !src.includes("<ToggleLeft")) {
    errors.push(`${PAGE}: must keep the Deactivate (ToggleLeft) inline action routed through ConfirmModal`);
  }
  if (!src.includes("ConfirmModal")) {
    errors.push(`${PAGE}: must keep the ConfirmModal soft-delete confirmation for deactivate`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on query error`);
  }
  if (!src.includes("No recurring bill templates yet.")) {
    errors.push(`${PAGE}: must keep the "No recurring bill templates yet." empty-state CTA`);
  }
  const mutations = (src.match(/useMutation\(/g) ?? []).length;
  if (mutations > 2) {
    errors.push(
      `${PAGE}: display-only migration — only the 2 pre-existing mutations (generate-now, deactivate) allowed, found ${mutations}`,
    );
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { ConfirmModal } from "../../../components/shared/ConfirmModal";
    function money(amount) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));
    }
    function statusBadge(isActive) { return null; }
    const deactivateMutation = useMutation({});
    const generateNowMutation = useMutation({});
    const columns = [
      { key: "template_name", label: "Template Name" },
      { key: "vendor_uuid", label: "Vendor", render: (t) => <EntityLink kind="vendor" id={t.vendor_uuid} /> },
      { key: "frequency", label: "Frequency" },
      { key: "next_generation_date", label: "Next Date" },
      { key: "amount", label: "Amount", render: (t) => money(t.amount) },
      { key: "auto_post", label: "Auto-Post" },
      { key: "is_active", label: "Status", render: (t) => statusBadge(t.is_active) },
      { key: "actions", label: "Actions", render: (t) => (
        <>
          <button onClick={() => generateNowMutation.mutate(t.uuid)}><Zap /></button>
          <button onClick={() => setDeactivateTarget({ uuid: t.uuid, name: t.template_name })}><ToggleLeft /></button>
        </>
      ) },
    ];
    <ListErrorState title="Couldn't load recurring templates" status={0} onRetry={() => {}} />
    <p>No recurring bill templates yet.</p>
    <ParityTable
      columns={columns}
      rows={templates}
      rowKey={(t) => t.uuid}
      storageKey="acct-recurring-bill-templates"
      tableTestId="recurring-bill-templates-table"
    />
    <ConfirmModal open={false} />
  `;
  const bad = `
    export function RecurringBillList() {
      return (
        <div>
          <div className="rounded-sm border border-red-200 bg-red-50">Failed to load recurring templates.</div>
          <table className="min-w-full"><thead><tr><th>Template Name</th></tr></thead></table>
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
  console.log(
    `OK ${LABEL}: ${PAGE} templates grid uses ParityTable; columns/money/badges/inline actions preserved 1:1; ListErrorState wired; no hand-rolled <table>.`,
  );
}

main();

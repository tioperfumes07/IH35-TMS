#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^(accounting\\.panel\\.reallocate|accounting\\.modal\\.decide|accounting\\.panel\\.detail|accounting\\.panel\\.class_cost_center_variance|accounting\\.panel\\.schedule|accounting\\.panel\\.receipt_detail|accounting\\.panel\\.leakage)$","task":"VERTICAL-REVERSE-LINK-INLINE-SURFACES"} */
/** @matrix-built {"modules":["cash-flow"],"cols":["reverse_link"],"leafRe":"^cash-flow\\.panel\\.projection$","task":"VERTICAL-REVERSE-LINK-INLINE-SURFACES"} */
/** @matrix-built {"modules":["tasks"],"cols":["reverse_link"],"leafRe":"^tasks\\.drawer\\.task$","task":"VERTICAL-REVERSE-LINK-INLINE-SURFACES"} */
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  allocation: read("apps/frontend/src/components/allocation/BillAllocationPanel.tsx"),
  disputes: read("apps/frontend/src/pages/accounting/DisputeQueuePage.tsx"),
  assets: read("apps/frontend/src/pages/accounting/FixedAssetsPage.tsx"),
  variance: read("apps/frontend/src/pages/accounting/PeriodComparisonPage.tsx"),
  prepaid: read("apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx"),
  receipts: read("apps/frontend/src/pages/accounting/ReceiptsPage.tsx"),
  revenue: read("apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx"),
  cashFlow: read("apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx"),
  tasks: read("apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx"),
  subjects: read("apps/frontend/src/components/tasks/TaskSubjectLink.tsx"),
};

const requiredDrops = new Map([
  ["accounting", ["accounting.panel.trk_bulk_register", "accounting.panel.period_status", "accounting.modal.create"]],
  ["lists", ["lists.modal.detail_type", "lists.modal.void_cancel_reason", "lists.modal.load_cancellation_reason", "lists.modal.termination_reason", "lists.modal.oem_parts_create"]],
  ["program", ["program.panel.thread"]],
]);

function hasColumn(module, leafId, column, override) {
  const raw = override ?? read(`docs/specs/scoreboard/modules/${module}.required.json`);
  const json = JSON.parse(raw);
  const leaf = json.leaves.find((candidate) => candidate.id === leafId);
  return Boolean(leaf?.required?.includes(column));
}

function failures(current = files, overrides = new Map()) {
  const checks = [
    ["allocation modal source bill drill", current.allocation.includes('<EntityLink kind="bill" id={billId} label={billLabel} />')],
    ["dispute modal driver drill", current.disputes.includes('<EntityLink kind="driver" id={row.driver_id}')],
    ["dispute modal settlement drill", current.disputes.includes('<EntityLink kind="settlement" id={row.settlement_id}')],
    ["fixed asset detail unit drill", current.assets.includes('<EntityLink kind="unit" id={detail.unit_uuid}')],
    ["class variance catalog drill", current.variance.includes('to={`/lists/accounting/classes?class_id=${encodeURIComponent(row.class_id)}`')],
    ["prepaid schedule JE drill", current.prepaid.includes('kind="journal_entry"') && current.prepaid.includes('id={detail.purchase_je_id}')],
    ["prepaid schedule account drills", current.prepaid.includes('id={detail.asset_account_id}') && current.prepaid.includes('id={detail.expense_account_id}')],
    ["receipt source drill", current.receipts.includes('kind={receiptEntityKind(data)}') && current.receipts.includes('id={data.entity_id}')],
    ["leakage load drill", current.revenue.includes('<EntityLink kind="load" id={row.load_id}')],
    ["cash-flow party drills", current.cashFlow.includes('<EntityLink kind="unit" id={e.ref_external_id}') && current.cashFlow.includes('<EntityLink kind={e.party_ref_kind} id={e.party_ref_id}') && current.cashFlow.includes('e.party_ref_kind === "driver"') && current.cashFlow.includes('e.party_ref_kind === "customer"') && current.cashFlow.includes('e.party_ref_kind === "vendor"')],
    ["task drawer subject drill", current.tasks.includes('<TaskSubjectLink subjectType={task.subject_type} subjectId={task.subject_id} subjectLabel={task.subject_label} />')],
    ["task subject maps load", current.subjects.includes('load: "load"')],
  ];
  for (const [module, leaves] of requiredDrops) {
    for (const leaf of leaves) checks.push([`${leaf} reverse_link N/A`, !hasColumn(module, leaf, "reverse_link", overrides.get(module))]);
  }
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutated = { ...files, allocation: files.allocation.replace('kind="bill"', 'kind="broken"') };
  if (!failures(mutated).includes("allocation modal source bill drill")) process.exit(1);
  const accounting = read("docs/specs/scoreboard/modules/accounting.required.json");
  const json = JSON.parse(accounting);
  json.leaves.find((leaf) => leaf.id === "accounting.panel.period_status").required.push("reverse_link");
  if (!failures(files, new Map([["accounting", JSON.stringify(json)]])).includes("accounting.panel.period_status reverse_link N/A")) process.exit(1);
  console.log("verify-reverse-link-inline-surface-linkage selftest PASS — drill and applicability mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-reverse-link-inline-surface-linkage FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-reverse-link-inline-surface-linkage PASS — 9 genuine reverse surfaces wired; 9 non-applicable claims removed");

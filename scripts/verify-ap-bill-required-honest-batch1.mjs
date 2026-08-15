#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","maintenance","reports"],"cols":["ap_bill"],"leafRe":"^(bills\\.create\\.maintenance|bills\\.create\\.fuel|bills\\.create\\.driver|bills\\.recurring|accounting\\.modal\\.ccpayment|accounting\\.parity\\.ccpayment|accounting\\.panel\\.bill_detail|wo\\.create_bill|maintenance\\.modal\\.create_bill|ap\\.aging|report\\.management|report\\.ap_aging)$","task":"LINK-F5188-AP-BILL-COLUMN-HONESTY-BATCH1"} */
/**
 * LINK-F5188 — ap_bill Required-column honesty audit, batch 1 (accounting + maintenance +
 * reports). Three independent Explore investigations covered accounting's 19 leaves,
 * vendors' 13 leaves, and a mixed banking/fleet/maintenance/reports/settlements 9-leaf batch;
 * this guard covers the resulting real fixes and false-required corrections from all three.
 *
 * BUILT (4 code locations close 6 leaf ids -- accounting.modal.create_bill's own fix also
 * satisfies maintenance's identically-shaped wo.create_bill / maintenance.modal.create_bill,
 * which share the exact same CreateBillModal.tsx root cause independently found by a separate
 * investigation of the maintenance module):
 *   - CreateBillModal.tsx (apps/frontend/src/pages/maintenance/components/): shared by
 *     accounting:bills.create.maintenance/fuel/driver AND maintenance:wo.create_bill /
 *     maintenance.modal.create_bill. createVendorBill() already returns the real created bill
 *     id at onSuccess; the modal discarded it by calling onClose() in the same tick. Now holds
 *     a confirmation step (EntityLink kind="bill" + Done button) before closing.
 *   - BillsPage.tsx: onCreated now also calls setHighlightedBillId(billId), reusing the
 *     existing deep-link banner + row-highlight mechanism (the Bill # column already links
 *     kind="bill" per row) -- belt-and-suspenders alongside the CreateBillModal fix above,
 *     since BillsPage is the accounting-side mount for the same modal.
 *   - RecurringBillList.tsx: generateNowMutation.onSuccess already had the real freshly-created
 *     bill id (result.billUuid) but only put it in a toast string; now shows a dismissible
 *     EntityLink banner (closes bills.recurring).
 *   - CCPaymentModal.tsx: bill.id was already used at submission time but the Bill # field
 *     rendered as a disabled plain-text <input>; now a real EntityLink (closes
 *     accounting.modal.ccpayment + accounting.parity.ccpayment, same file/leaf pair).
 *   - BillDetailPanel.tsx: BillSummary's own type never declared an id field even though every
 *     caller has one; added id + EntityLink render (closes accounting.panel.bill_detail).
 *
 * RECLASSIFIED false-required (dropped, not force-built -- each verified against a real
 * per-vendor aggregate type with no bill id field):
 *   - accounting:ap.aging, reports:report.management, reports:report.ap_aging -- all three
 *     source from ApAgingVendor/APAgingRow, a vendor-level rollup (vendor_id + age-bucket
 *     totals, open_bill_count), same false-required shape as the already-dropped gl_je flags
 *     on cash-flow rollups earlier this session.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATE_BILL_MODAL = "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx";
const BILLS_PAGE = "apps/frontend/src/pages/accounting/BillsPage.tsx";
const RECURRING_BILL_LIST = "apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx";
const CC_PAYMENT_MODAL = "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx";
const BILL_DETAIL_PANEL = "apps/frontend/src/pages/accounting/BillDetailPanel.tsx";
const FILES = [CREATE_BILL_MODAL, BILLS_PAGE, RECURRING_BILL_LIST, CC_PAYMENT_MODAL, BILL_DETAIL_PANEL];
const LABEL = "verify-ap-bill-required-honest-batch1";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  accounting: "docs/specs/scoreboard/modules/accounting.required.json",
  reports: "docs/specs/scoreboard/modules/reports.required.json",
};

const DROPPED = [
  ["accounting", "ap.aging"],
  ["reports", "report.management"],
  ["reports", "report.ap_aging"],
];

const KEEP_REQUIRED = [
  ["accounting", "bills.create.maintenance"],
  ["accounting", "bills.create.fuel"],
  ["accounting", "bills.create.driver"],
  ["accounting", "bills.recurring"],
  ["accounting", "accounting.modal.ccpayment"],
  ["accounting", "accounting.parity.ccpayment"],
  ["accounting", "accounting.panel.bill_detail"],
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertApBillBatch1(sources, docs) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];

  for (const [mod, id] of DROPPED) {
    const leaf = (docs[mod].leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if ((leaf.required || []).includes("ap_bill")) problems.push(`${mod}:${id} must not require ap_bill`);
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    const leaf = (docs[mod].leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if (!(leaf.required || []).includes("ap_bill")) problems.push(`${mod}:${id} must keep ap_bill`);
  }

  const modal = src[CREATE_BILL_MODAL];
  const billsPage = src[BILLS_PAGE];
  const recurring = src[RECURRING_BILL_LIST];
  const cc = src[CC_PAYMENT_MODAL];
  const detail = src[BILL_DETAIL_PANEL];

  if (!/setCreatedBill\(/.test(modal)) problems.push(`${CREATE_BILL_MODAL}: must hold created bill in state`);
  if (!/kind="bill"/.test(modal)) problems.push(`${CREATE_BILL_MODAL}: must EntityLink kind=bill for the created bill`);
  if (!/setHighlightedBillId\(billId\)/.test(billsPage)) problems.push(`${BILLS_PAGE}: onCreated must set highlightedBillId`);
  if (!/setLastGeneratedBillId\(result\.billUuid\)/.test(recurring)) problems.push(`${RECURRING_BILL_LIST}: must capture result.billUuid`);
  if (!/kind="bill"/.test(recurring)) problems.push(`${RECURRING_BILL_LIST}: must EntityLink kind=bill in the confirmation banner`);
  if (!/kind="bill"/.test(cc)) problems.push(`${CC_PAYMENT_MODAL}: Bill # field must EntityLink kind=bill`);
  if (!/id\?:\s*string\s*\|\s*null/.test(detail)) problems.push(`${BILL_DETAIL_PANEL}: BillSummary must type id`);
  if (!/kind="bill"/.test(detail)) problems.push(`${BILL_DETAIL_PANEL}: Bill # field must EntityLink kind=bill`);

  return problems;
}

function selftest() {
  const good = {
    [CREATE_BILL_MODAL]: `
      const [createdBill, setCreatedBill] = useState(null);
      if (res?.bill?.id) { setCreatedBill({ id: res.bill.id, bill_number: res.bill.bill_number ?? null }); }
      <EntityLink kind="bill" id={createdBill.id} label="x" />
    `,
    [BILLS_PAGE]: `
      onCreated={(billId) => { if (billId) setHighlightedBillId(billId); }}
    `,
    [RECURRING_BILL_LIST]: `
      setLastGeneratedBillId(result.billUuid);
      <EntityLink kind="bill" id={lastGeneratedBillId} label="View bill" />
    `,
    [CC_PAYMENT_MODAL]: `
      <EntityLink kind="bill" id={bill.id} label="x" />
    `,
    [BILL_DETAIL_PANEL]: `
      type BillSummary = {
        id?: string | null;
      };
      bill.id ? <EntityLink kind="bill" id={bill.id} label="x" /> : null
    `,
  };
  const docs = {};
  for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);

  const goodProblems = assertApBillBatch1(good, docs);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  let mutationCount = 0;
  const sourceMutations = [
    { ...good, [CREATE_BILL_MODAL]: good[CREATE_BILL_MODAL].replace("setCreatedBill(", "setXxx(") },
    { ...good, [CREATE_BILL_MODAL]: good[CREATE_BILL_MODAL].replace('kind="bill"', "") },
    { ...good, [BILLS_PAGE]: good[BILLS_PAGE].replace("setHighlightedBillId(billId)", "setHighlightedBillId(null)") },
    { ...good, [RECURRING_BILL_LIST]: good[RECURRING_BILL_LIST].replace("setLastGeneratedBillId(result.billUuid);", "") },
    { ...good, [RECURRING_BILL_LIST]: good[RECURRING_BILL_LIST].replace('kind="bill"', "") },
    { ...good, [CC_PAYMENT_MODAL]: good[CC_PAYMENT_MODAL].replace('kind="bill"', "") },
    { ...good, [BILL_DETAIL_PANEL]: good[BILL_DETAIL_PANEL].replace("id?: string | null;", "") },
    { ...good, [BILL_DETAIL_PANEL]: good[BILL_DETAIL_PANEL].replace('kind="bill"', "") },
  ];
  for (const mutated of sourceMutations) {
    mutationCount++;
    if (assertApBillBatch1(mutated, docs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — source mutation ${mutationCount} escaped detection`);
      process.exit(1);
    }
  }
  for (const [mod, id] of DROPPED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = [...new Set([...(leaf.required || []), "ap_bill"])];
    if (assertApBillBatch1(good, mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add ap_bill to ${mod}:${id}`);
      process.exit(1);
    }
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = (leaf.required || []).filter((c) => c !== "ap_bill");
    if (assertApBillBatch1(good, mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: drop ap_bill from ${mod}:${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const liveDocs = {};
for (const [mod, rel] of Object.entries(REQUIRED_FILES)) liveDocs[mod] = readJson(rel);
const failures = assertApBillBatch1(undefined, liveDocs);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);

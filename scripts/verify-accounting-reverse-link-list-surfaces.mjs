#!/usr/bin/env node
/**
 * Accounting reverse_link remainder — leaf-specific Built for list/detail surfaces
 * that already drill via EntityLink. Honesty drops create-only modals/drawers elsewhere.
 *
 * @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^(bill_payments\\.list|payments\\.receive|collections|factoring\\.list|je\\.list|audit_trail|accounting\\.panel\\.bill_detail|accounting\\.parity\\.(expenses_list_page|factoring_detail_page|receipts_page|vendor_credits_page))$","task":"VERTICAL-REVERSE-LINK-accounting-lists","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-accounting-reverse-link-list-surfaces.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-reverse-link-list-surfaces";
const AUDIT_TRAIL = "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx";
const POSTING_LINEAGE = "apps/frontend/src/pages/accounting/PostingLineagePage.tsx";
const JE_DETAIL = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";

const CHECKS = [
  { name: "BillPaymentsList EntityLink", file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx", pattern: /EntityLink/ },
  { name: "ReceiptsPage EntityLink payment", file: "apps/frontend/src/pages/accounting/ReceiptsPage.tsx", pattern: /EntityLink/ },
  { name: "CollectionsPage EntityLink", file: "apps/frontend/src/pages/accounting/CollectionsPage.tsx", pattern: /EntityLink/ },
  { name: "FactoringListPage EntityLink", file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx", pattern: /EntityLink/ },
  { name: "ManualJEList EntityLink", file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx", pattern: /EntityLink/ },
  { name: "AuditTrail EntityLink", file: "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx", pattern: /EntityLink/ },
  { name: "AuditTrail bill-payment canonical kind", file: AUDIT_TRAIL, pattern: /case "bill_payment":\s*return "bill_payment";/ },
  { name: "AuditTrail driver-advance canonical drill", file: AUDIT_TRAIL, pattern: /case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/ },
  { name: "AuditTrail transfer canonical drill", file: AUDIT_TRAIL, pattern: /case "transfer":\s*return "transfer";/ },
  { name: "Audit API bill-payment canonical kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "bill_payment":\s*return "bill_payment";/ },
  { name: "Audit API driver-advance canonical kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "driver_advance":\s*return "cash_advance";/ },
  { name: "Audit API transfer canonical kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "transfer":\s*return "transfer";/ },
  { name: "Audit API emits canonical source kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /source_entity_kind:\s*accountingSourceEntityKind/ },
  { name: "Audit client carries canonical source kind", file: "apps/frontend/src/api/accounting.ts", pattern: /export type AccountingAuditTrailEvent = \{[\s\S]*?source_transaction_type:\s*string \| null;\s*source_entity_kind:\s*string \| null;[\s\S]*?\n\};/ },
  { name: "Audit Trail consumes canonical source kind", file: AUDIT_TRAIL, pattern: /type=\{row\.source_entity_kind \?\? row\.source_transaction_type\}/ },
  { name: "Posting Lineage bill-payment canonical drill", file: POSTING_LINEAGE, pattern: /case "bill_payment":\s*return "bill_payment";/ },
  { name: "Posting Lineage driver-advance canonical drill", file: POSTING_LINEAGE, pattern: /case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/ },
  { name: "Posting Lineage transfer canonical drill", file: POSTING_LINEAGE, pattern: /case "transfer":\s*return "transfer";/ },
  { name: "Lineage API emits canonical source kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /source_entity_kind:\s*accountingSourceEntityKind\(String\(row\.source_transaction_type/ },
  { name: "Lineage API emits canonical linked-object kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /linked_object_entity_kind:\s*accountingSourceEntityKind\(row\.linked_object_type/ },
  { name: "Lineage client carries canonical linked-object kind", file: "apps/frontend/src/api/accounting.ts", pattern: /export type AccountingSourceLineageRow = \{[\s\S]*?linked_object_type:\s*string \| null;\s*linked_object_entity_kind:\s*string \| null;/ },
  { name: "Posting Lineage consumes canonical linked-object kind", file: POSTING_LINEAGE, pattern: /type=\{row\.linked_object_entity_kind \?\? row\.linked_object_type\}/ },
  { name: "JE source API canonicalizes bill payment", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'bill_payment' THEN 'bill_payment'/ },
  { name: "JE source API canonicalizes driver advance", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'driver_advance' THEN 'cash_advance'/ },
  { name: "JE source client carries canonical kinds", file: "apps/frontend/src/api/accounting.ts", pattern: /export type JournalEntrySourceLink = \{[\s\S]*?source_entity_kind:\s*string \| null;[\s\S]*?linked_object_entity_kind:\s*string \| null;/ },
  { name: "JE detail bill-payment canonical drill", file: JE_DETAIL, pattern: /case "bill_payment":\s*return "bill_payment";/ },
  { name: "JE detail driver-advance canonical drill", file: JE_DETAIL, pattern: /case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/ },
  { name: "JE detail consumes source canonical kind", file: JE_DETAIL, pattern: /type:\s*row\.source_entity_kind \?\? row\.source_transaction_type/ },
  { name: "JE detail consumes linked-object canonical kind", file: JE_DETAIL, pattern: /type:\s*row\.linked_object_entity_kind \?\? row\.linked_object_type/ },
  { name: "BillDetailPanel EntityLink", file: "apps/frontend/src/pages/accounting/BillDetailPanel.tsx", pattern: /EntityLink/ },
  { name: "ExpensesListPage EntityLink", file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx", pattern: /EntityLink/ },
  { name: "FactoringDetailPage EntityLink", file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx", pattern: /EntityLink/ },
  { name: "VendorCreditsPage EntityLink", file: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx", pattern: /EntityLink/ },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: no EntityLink in ${c.file}`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".acct-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  const auditTrail = fs.readFileSync(path.join(ROOT, AUDIT_TRAIL), "utf8");
  const wrongApRoute = auditTrail.replace(/case "bill_payment":\s*return "bill_payment";/, 'case "bill_payment":\n      return "payment";');
  if (/case "bill_payment":\s*return "bill_payment";/.test(wrongApRoute)) {
    console.error(`${LABEL} SELFTEST FAIL — bill-payment wrong-route mutation stayed green`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — bill-payment wrong-route mutation red`);
  const deadAdvanceDrill = auditTrail.replace(/case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/, 'case "cash_advance":\n      return "cash_advance";');
  if (/case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/.test(deadAdvanceDrill)) {
    console.error(`${LABEL} SELFTEST FAIL — driver-advance dead-drill mutation stayed green`);
    process.exit(1);
  }
  const deadTransferDrill = auditTrail.replace(/case "transfer":\s*return "transfer";/, "");
  if (/case "transfer":\s*return "transfer";/.test(deadTransferDrill)) {
    console.error(`${LABEL} SELFTEST FAIL — transfer dead-drill mutation stayed green`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — driver-advance and transfer dead-drill mutations red`);
  const postingLineage = fs.readFileSync(path.join(ROOT, POSTING_LINEAGE), "utf8");
  const wrongLineageBillRoute = postingLineage.replace(/case "bill_payment":\s*return "bill_payment";/, 'case "bill_payment":\n      return "payment";');
  const deadLineageAdvance = postingLineage.replace(/case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/, 'case "cash_advance":\n      return "cash_advance";');
  const deadLineageTransfer = postingLineage.replace(/case "transfer":\s*return "transfer";/, "");
  if (/case "bill_payment":\s*return "bill_payment";/.test(wrongLineageBillRoute)
    || /case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/.test(deadLineageAdvance)
    || /case "transfer":\s*return "transfer";/.test(deadLineageTransfer)) {
    console.error(`${LABEL} SELFTEST FAIL — Posting Lineage wrong/dead-route mutation stayed green`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — Posting Lineage wrong/dead-route mutations red`);
  process.exit(0);
}

const fails = run();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting reverse_link list surfaces ratcheted`);

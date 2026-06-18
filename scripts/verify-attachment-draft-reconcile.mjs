#!/usr/bin/env node
// Guard (Option B — attachment-draft-reconcile): create routes that accept files BEFORE the record
// exists (via UploadZone's random draft entity_id) MUST re-key those attachments onto the real record
// id in the SAME transaction, or the evidence is silently orphaned (see
// docs/specs/ATTACHMENT-DRAFT-LINKAGE-FIX.md). This locks: the shared helper exists and is per-OCI
// scoped, and every create route in scope threads `attachment_draft_id` + calls the helper.
//
// Increment 1: expense + work_order (inline-insert txns). Increment 2: bill (schema in route, re-key in
// createBill service txn), invoice + payment (inline-insert route txns). All 5 create surfaces now thread
// attachment_draft_id and re-key in the same transaction as the record insert.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-attachment-draft-reconcile: ${m}`); process.exit(1); };
const read = (p) => readFileSync(join(root, p), "utf8");

// 1) Shared helper: exists, scoped by operating_company_id, re-keys entity_id draft -> new.
const svc = read("apps/backend/src/documents/attachments.service.ts");
if (!/export async function reassignDraftAttachments/.test(svc)) fail("reassignDraftAttachments helper missing");
if (!/UPDATE documents\.attachments/.test(svc)) fail("helper must UPDATE documents.attachments");
if (!/operating_company_id = \$1/.test(svc)) fail("helper must scope the re-key by operating_company_id (per-entity isolation)");
if (!/SET entity_id = \$4/.test(svc)) fail("helper must set entity_id to the new record id");

// 2) Wired create surfaces: the body schema accepts attachment_draft_id (schemaFile) AND the helper is
// called with the right entity_type in the same txn as the insert (callFile — the service for bill).
const WIRED = [
  { schemaFile: "apps/backend/src/accounting/expenses.routes.ts", callFile: "apps/backend/src/accounting/expenses.routes.ts", entityType: "expense" },
  { schemaFile: "apps/backend/src/work-orders/work-orders.routes.ts", callFile: "apps/backend/src/work-orders/work-orders.routes.ts", entityType: "work_order" },
  // The endpoint the Create WO modal ACTUALLY posts to (POST /api/v1/maintenance/work-orders) — the
  // /api/v1/work-orders reconcile above is on a route the UI doesn't hit, so this is the one that matters.
  { schemaFile: "apps/backend/src/maintenance/work-orders.routes.ts", callFile: "apps/backend/src/maintenance/work-orders.routes.ts", entityType: "work_order" },
  { schemaFile: "apps/backend/src/accounting/bills.routes.ts", callFile: "apps/backend/src/accounting/bills.service.ts", entityType: "bill" },
  { schemaFile: "apps/backend/src/accounting/invoices.routes.ts", callFile: "apps/backend/src/accounting/invoices.routes.ts", entityType: "invoice" },
  { schemaFile: "apps/backend/src/accounting/payments.routes.ts", callFile: "apps/backend/src/accounting/payments.routes.ts", entityType: "payment" },
];
for (const { schemaFile, callFile, entityType } of WIRED) {
  const schema = read(schemaFile);
  if (!/attachment_draft_id: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/.test(schema))
    fail(`${schemaFile}: create body schema must accept optional attachment_draft_id (entity ${entityType})`);
  const call = read(callFile);
  if (!/reassignDraftAttachments\(/.test(call)) fail(`${callFile}: must call reassignDraftAttachments`);
  if (!new RegExp(`entityType: "${entityType}"`).test(call)) fail(`${callFile}: reconcile must use entityType "${entityType}"`);
}

console.log(`PASS verify-attachment-draft-reconcile (all 5 create surfaces wired: expense, work_order, bill, invoice, payment)`);

#!/usr/bin/env node
// Guard (Option B — attachment-draft-reconcile): create routes that accept files BEFORE the record
// exists (via UploadZone's random draft entity_id) MUST re-key those attachments onto the real record
// id in the SAME transaction, or the evidence is silently orphaned (see
// docs/specs/ATTACHMENT-DRAFT-LINKAGE-FIX.md). This locks: the shared helper exists and is per-OCI
// scoped, and every create route in scope threads `attachment_draft_id` + calls the helper.
//
// Increment 1: expense + work_order (inline-insert txns). Increment 2 (bill/invoice/payment, which route
// through service fns) extends WIRED below when those land — until then they are listed as PENDING so the
// guard documents the remaining surfaces rather than silently passing.
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

// 2) Wired create routes: accept attachment_draft_id + call the helper with the right entity_type.
const WIRED = [
  { file: "apps/backend/src/accounting/expenses.routes.ts", entityType: "expense" },
  { file: "apps/backend/src/work-orders/work-orders.routes.ts", entityType: "work_order" },
];
for (const { file, entityType } of WIRED) {
  const src = read(file);
  if (!/attachment_draft_id: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/.test(src))
    fail(`${file}: create body schema must accept optional attachment_draft_id`);
  if (!/reassignDraftAttachments\(/.test(src)) fail(`${file}: must call reassignDraftAttachments`);
  if (!new RegExp(`entityType: "${entityType}"`).test(src)) fail(`${file}: reconcile must use entityType "${entityType}"`);
}

// 3) Increment 2 surfaces — documented as pending so this guard is the running checklist.
const PENDING = ["bill", "invoice", "payment"];
console.log(`PASS verify-attachment-draft-reconcile (wired: expense, work_order · pending inc2: ${PENDING.join(", ")})`);

#!/usr/bin/env node
/**
 * verify-d1-settlement-approval.mjs
 *
 * Verifies D1 Settlement Approval Workspace implementation:
 * 1. Database schema exists (settlement_line_items, trip_link_queue, escrow_balances, escrow_ledger)
 * 2. Settlement approval status enum exists
 * 3. Trip-link engine exists and exports key functions
 * 4. Approval service exists with per-line approve/reject
 * 5. Approval routes registered
 * 6. PDF generation is gated behind finalized status
 * 7. Escrow balance tracking exists
 * 8. Trip-link queue surfaces unlinked expenses
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();

function checkFile(path, description) {
  const fullPath = resolve(ROOT, path);
  if (!existsSync(fullPath)) {
    return { pass: false, error: `${description} not found: ${path}` };
  }
  return { pass: true };
}

function checkFileContains(path, expected, description) {
  const fullPath = resolve(ROOT, path);
  if (!existsSync(fullPath)) {
    return { pass: false, error: `${description} not found: ${path}` };
  }
  const content = readFileSync(fullPath, "utf-8");
  if (!content.includes(expected)) {
    return { pass: false, error: `${description} missing expected content: ${expected}` };
  }
  return { pass: true };
}

const checks = [
  // 1. Migration exists
  () => checkFile("db/migrations/202606120600_d1_settlement_approval.sql", "D1 migration"),
  
  // 2. Schema elements in migration
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "settlement_line_items", "Migration: settlement_line_items table"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "trip_link_queue", "Migration: trip_link_queue table"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "escrow_balances", "Migration: escrow_balances table"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "escrow_ledger", "Migration: escrow_ledger table"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "approval_status", "Migration: approval_status column"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "driver_visible", "Migration: driver_visible flag"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "disputed", "Migration: disputed flag"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "GRANT USAGE ON SEQUENCE", "Migration: sequence grants"),
  
  // 3. Trip-link engine
  () => checkFile("apps/backend/src/settlements/trip-link.engine.ts", "Trip-link engine"),
  () => checkFileContains("apps/backend/src/settlements/trip-link.engine.ts", "findTripMatches", "Trip-link: findTripMatches function"),
  () => checkFileContains("apps/backend/src/settlements/trip-link.engine.ts", "autoLinkExpense", "Trip-link: autoLinkExpense function"),
  () => checkFileContains("apps/backend/src/settlements/trip-link.engine.ts", "queueForTripLink", "Trip-link: queueForTripLink function"),
  () => checkFileContains("apps/backend/src/settlements/trip-link.engine.ts", "dispatch.loads", "Trip-link: queries dispatch.loads"),
  () => checkFileContains("apps/backend/src/settlements/trip-link.engine.ts", "dispatched on load", "Trip-link: match reason"),
  
  // 4. Approval service
  () => checkFile("apps/backend/src/settlements/approval.service.ts", "Approval service"),
  () => checkFileContains("apps/backend/src/settlements/approval.service.ts", "approveLineItem", "Approval: approveLineItem function"),
  () => checkFileContains("apps/backend/src/settlements/approval.service.ts", "rejectLineItem", "Approval: rejectLineItem function"),
  () => checkFileContains("apps/backend/src/settlements/approval.service.ts", "checkAllLinesApproved", "Approval: checkAllLinesApproved function"),
  () => checkFileContains("apps/backend/src/settlements/approval.service.ts", "finalizeSettlement", "Approval: finalizeSettlement function"),
  () => checkFileContains("apps/backend/src/settlements/approval.service.ts", "updateEscrowBalance", "Approval: escrow balance tracking"),
  () => checkFileContains("apps/backend/src/settlements/approval.service.ts", "escrow_ledger", "Approval: escrow ledger writes"),
  () => checkFileContains("apps/backend/src/settlements/approval.service.ts", "settlement_line_approved", "Approval: audit event for approve"),
  () => checkFileContains("apps/backend/src/settlements/approval.service.ts", "settlement_pdf_generated", "Approval: audit event for PDF"),
  
  // 5. Approval routes
  () => checkFile("apps/backend/src/settlements/approval.routes.ts", "Approval routes"),
  () => checkFileContains("apps/backend/src/settlements/approval.routes.ts", "/api/v1/settlements/:id/approval-summary", "Routes: approval-summary endpoint"),
  () => checkFileContains("apps/backend/src/settlements/approval.routes.ts", "/api/v1/settlements/approve-line", "Routes: approve-line endpoint"),
  () => checkFileContains("apps/backend/src/settlements/approval.routes.ts", "/api/v1/settlements/finalize", "Routes: finalize endpoint"),
  () => checkFileContains("apps/backend/src/settlements/approval.routes.ts", "/api/v1/trip-link-queue", "Routes: trip-link-queue endpoint"),
  () => checkFileContains("apps/backend/src/settlements/approval.routes.ts", "pdf_generation_blocked", "Routes: PDF generation gating"),
  () => checkFileContains("apps/backend/src/settlements/approval.routes.ts", "'finalized'", "Routes: finalized status check"),
  
  // 6. RLS policies
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "ENABLE ROW LEVEL SECURITY", "RLS: enabled"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "settlement_line_items_tenant_isolation", "RLS: settlement_line_items policy"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "trip_link_queue_tenant_isolation", "RLS: trip_link_queue policy"),
  
  // 7. Indexes
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "idx_settlement_line_items_settlement_id", "Index: settlement_id"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "idx_trip_link_queue_status", "Index: trip_link_queue status"),
  
  // 8. Database grants
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.settlement_line_items", "Grants: settlement_line_items"),
  () => checkFileContains("db/migrations/202606120600_d1_settlement_approval.sql", "GRANT USAGE ON SEQUENCE", "Grants: sequences"),
];

let passed = 0;
let failed = 0;

for (const check of checks) {
  const result = check();
  if (result.pass) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${result.error}`);
  }
}

console.log(`\nD1 Settlement Approval verification: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
console.log("PASS: D1 settlement approval implementation verified");

#!/usr/bin/env node
/**
 * CLOSURE-16-DEEP-AUDIT-C — WO → Bill → QBO workflow static guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "deep-audit-c-workflow-wo-to-bill-to-qbo";

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const woRoutes = read("apps/backend/src/maintenance/work-orders.routes.ts");
const twoSection = read("apps/backend/src/maintenance/two-section-service.ts");
const billPaymentModal = read("apps/frontend/src/components/ap/BillPaymentModal.tsx");
const audit = read("docs/audits/DEEP-AUDIT-C-E2E-WORKFLOWS.md");

if (!woRoutes.includes("work-orders")) fail("work-orders routes must exist");
if (!twoSection.includes("autoCreateBillFromWO")) fail("two-section-service must auto-create bill from WO");
if (!woRoutes.includes("autoCreateBillFromWO")) fail("work-orders routes must call autoCreateBillFromWO");
if (!billPaymentModal.includes("BillPaymentModal")) fail("BillPaymentModal must be present (AUDIT-FIX-16)");
if (!audit.includes("Workflow 1")) fail("audit doc must document Workflow 1");

console.log(`[${LABEL}] PASS`);

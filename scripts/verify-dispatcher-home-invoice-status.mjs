#!/usr/bin/env node
// verify-dispatcher-home-invoice-status (dispatch-sweep-gap-21 residual)
// Dispatcher Home active-loads widget must surface the same read-only load→invoice
// reverse linkage already guarded on GET /api/v1/dispatch/loads (verify-dispatch-load-invoice-linkage).
// Pure display enrichment — no GL write. Self-test: --selftest
// LINKAGE: dispatcher-board/home.active_loads → accounting.invoices (reverse, read-only).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts";
const PANEL = "apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function checkService(src) {
  const failures = [];
  if (!/accounting\.invoices\s+i[\s\S]{0,240}?i\.source_load_id\s*=\s*l\.id/i.test(src)) {
    failures.push("Dispatcher Home active loads must JOIN accounting.invoices on i.source_load_id = l.id");
  }
  if (!/i\.operating_company_id\s*=\s*l\.operating_company_id/i.test(src)) {
    failures.push("invoice join must be entity-scoped (i.operating_company_id = l.operating_company_id)");
  }
  if (!/AS\s+invoice_status/i.test(src) || !/invoice_display_id/i.test(src)) {
    failures.push("must select invoice_display_id + invoice_status for Home display");
  }
  if (!/invoice_status:\s*row\.invoice_status/i.test(src)) {
    failures.push("must map invoice_status onto DispatcherHomeActiveLoad response rows");
  }
  return failures;
}

export function checkPanel(src) {
  const failures = [];
  if (!/invoice_status\??:\s*/.test(src)) {
    failures.push("DispatcherActiveLoadRow must declare invoice_status");
  }
  if (!/dispatcher-active-load-invoice/.test(src)) {
    failures.push("Active loads panel must render invoice status (data-testid=dispatcher-active-load-invoice)");
  }
  return failures;
}

export function run() {
  const failures = [];
  try {
    failures.push(...checkService(read(SERVICE)));
  } catch {
    failures.push(`${SERVICE} not found`);
  }
  try {
    failures.push(...checkPanel(read(PANEL)));
  } catch {
    failures.push(`${PANEL} not found`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const goodService = `
    LEFT JOIN LATERAL (
      SELECT i.display_id::text AS invoice_display_id, i.status::text AS invoice_status
      FROM accounting.invoices i
      WHERE i.source_load_id = l.id AND i.operating_company_id = l.operating_company_id
    ) inv ON true
    invoice_status: row.invoice_status ? String(row.invoice_status) : null,
  `;
  const goodPanel = `
    invoice_status?: string | null;
    data-testid="dispatcher-active-load-invoice"
  `;
  const checks = [
    ["service good", checkService(goodService).length === 0],
    ["panel good", checkPanel(goodPanel).length === 0],
    ["service missing join fails", checkService("SELECT 1").length > 0],
    ["panel missing testid fails", checkPanel("invoice_status?: string").length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("SELFTEST FAIL", failed.map(([n]) => n));
    process.exit(1);
  }
  console.log("SELFTEST PASS");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("FAIL dispatcher-home-invoice-status:");
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log("PASS dispatcher-home-invoice-status");

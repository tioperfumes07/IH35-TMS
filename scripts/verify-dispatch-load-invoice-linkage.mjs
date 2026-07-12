#!/usr/bin/env node
// verify-dispatch-load-invoice-linkage (dispatch-sweep-gap-21)
// Active Load → Invoice reverse linkage (§10 Linkage Law, load→invoice drill-through).
// Asserts the GET /api/v1/dispatch/loads listing query surfaces the load's invoice status by
// LEFT JOINing accounting.invoices on the CANONICAL hub key source_load_id = loads.id, and selects
// invoice_status for display. Read-only (no write / no GL posting). Guards the linkage from being
// removed or repointed off the canonical FK. Self-test: node scripts/verify-dispatch-load-invoice-linkage.mjs --selftest
// LINKAGE: dispatch.loads_listing → accounting.invoices (reverse, read-only). Additive only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/backend/src/dispatch/loads.routes.ts";

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

export function check(src) {
  const failures = [];
  // Must LEFT JOIN accounting.invoices linked on the canonical source_load_id = loads.id key.
  if (!/accounting\.invoices\s+i[\s\S]{0,200}?i\.source_load_id\s*=\s*l\.id/i.test(src)) {
    failures.push("active-loads listing must LEFT JOIN accounting.invoices on i.source_load_id = l.id (canonical load↔invoice hub)");
  }
  // Must surface invoice_status for the dispatch board display.
  if (!/i\.status\s+AS\s+invoice_status/i.test(src)) {
    failures.push("listing must select i.status AS invoice_status (reverse-linkage display field)");
  }
  // Must remain scoped to the same operating company (entity isolation).
  if (!/i\.operating_company_id\s*=\s*l\.operating_company_id/i.test(src)) {
    failures.push("invoice join must be entity-scoped (i.operating_company_id = l.operating_company_id)");
  }
  // Must not repoint the load link at a RETIRE loads table.
  if (/source_load_id[\s\S]{0,80}?dispatch\.loads/i.test(src)) {
    failures.push("invoice→load link must target canonical mdata.loads, never dispatch.loads (RETIRE)");
  }
  return failures;
}

export function run() {
  let src;
  try { src = read(SRC); } catch { return [`${SRC} not found — dispatch loads route missing`]; }
  return check(src);
}

if (process.argv.includes("--selftest")) {
  const good = `
    inv.invoice_status
    ) sd ON true
    LEFT JOIN LATERAL (
      SELECT i.status AS invoice_status
      FROM accounting.invoices i
      WHERE i.source_load_id = l.id
        AND i.operating_company_id = l.operating_company_id
        AND i.status <> 'void'
    ) inv ON true`;
  const missingJoin = `SELECT i.status AS invoice_status FROM accounting.invoices i WHERE i.customer_id = l.customer_id`;
  const missingScope = `FROM accounting.invoices i WHERE i.source_load_id = l.id AND i.status AS invoice_status`;
  const checks = [
    ["canonical read-only linkage passes", check(good).length === 0],
    ["missing source_load_id join is caught", check(missingJoin).length > 0],
    ["missing entity scope is caught", check(missingScope).some((f) => /entity-scoped/.test(f))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:dispatch-load-invoice-linkage --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:dispatch-load-invoice-linkage --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:dispatch-load-invoice-linkage FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:dispatch-load-invoice-linkage PASS (load→invoice reverse linkage present + entity-scoped)");
}

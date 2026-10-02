#!/usr/bin/env node
/**
 * B-2 LEFT — JE-line reconcilable rows (ORDERS-2026-10-01 §6 / QBO REGISTER SPEC §6).
 * Asserts reconcile workspace loads GL postings on the bank ledger, clear accepts posting_id
 * via the register_cleared one-writer, and FE merges gl_lines into the grid.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-b2-je-line-reconcilable";

const HELPER = "apps/backend/src/banking/reconcilable-gl-lines.ts";
const ROUTES = "apps/backend/src/banking/reconciliation.routes.ts";
const WORKSPACE = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";
const API = "apps/frontend/src/api/banking.ts";
const ONE_WRITER = "scripts/verify-competing-engine-register-cleared-one-writer.mjs";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function assertNotIncludes(src, needle, where) {
  if (src.includes(needle)) throw new Error(`${where}: must not contain ${JSON.stringify(needle)}`);
}

function main() {
  const helper = read(HELPER);
  const routes = read(ROUTES);
  const workspace = read(WORKSPACE);
  const api = read(API);

  assertIncludes(helper, "listReconcilableGlLines", HELPER);
  assertIncludes(helper, "clearReconcilableGlLine", HELPER);
  assertIncludes(helper, "toggleAccountRegisterCleared", HELPER);
  assertIncludes(helper, "ledger_account_id", HELPER);
  assertIncludes(helper, "register_cleared", HELPER);
  assertIncludes(helper, "matched_journal_entry_id", HELPER);
  assertIncludes(helper, 'debit_or_credit === "debit"', HELPER);

  // Clear path must NOT SET register_cleared directly in reconciliation.routes — one-writer.
  assertNotIncludes(routes, "SET register_cleared", ROUTES);
  assertIncludes(routes, "listReconcilableGlLines", ROUTES);
  assertIncludes(routes, "gl_lines", ROUTES);
  assertIncludes(routes, "posting_id", ROUTES);
  assertIncludes(routes, "clearReconcilableGlLine", ROUTES);
  assertIncludes(routes, "foldGlLinesIntoSummary", ROUTES);
  assertIncludes(helper, "foldGlLinesIntoSummary", HELPER);

  assertIncludes(api, "ReconciliationGlLine", API);
  assertIncludes(api, "gl_lines?", API);
  assertIncludes(api, "posting_id?:", API);

  assertIncludes(workspace, "glLineToGridRow", WORKSPACE);
  assertIncludes(workspace, 'row_kind: "gl_line"', WORKSPACE);
  assertIncludes(workspace, "gl_lines", WORKSPACE);
  assertIncludes(workspace, "posting_id: tx.posting_id", WORKSPACE);

  // One-writer guard still present and still names account-register.service as canonical.
  const oneWriter = read(ONE_WRITER);
  assertIncludes(oneWriter, "account-register.service.ts", ONE_WRITER);

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();

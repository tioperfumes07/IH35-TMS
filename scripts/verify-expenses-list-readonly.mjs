#!/usr/bin/env node
/**
 * Static guard for the GAP-EXPENSES browse side (GET /api/v1/expenses).
 *
 * Locks the list endpoint as STRICTLY READ-ONLY so it cannot silently grow a write
 * (following the #1755 read-only reconciliation-status precedent):
 *
 *   1. The list route must be registered as GET (app.get("/api/v1/expenses")).
 *   2. The GET list handler + the shared queryExpensesList helper must contain NO
 *      INSERT / UPDATE / DELETE against any schema — SELECT only.
 *   3. The list must stay entity-scoped: the GET handler wraps the read in withCompanyScope
 *      (SET app.operating_company_id → RLS) and guards with relationExists("accounting.expenses").
 *
 * Pure file-content checks — no DB required. Safe to run in CI.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ROUTE = "apps/backend/src/accounting/expenses.routes.ts";

let failed = 0;
function fail(msg) {
  console.error(`verify-expenses-list-readonly: ${msg}`);
  failed = 1;
}
function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`expected file is missing: ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

// Write statements that must NEVER appear in a read-only list path. "updated_at" etc. are safe
// because we require the keyword UPDATE to be followed by a schema-qualified table name.
const WRITE_PATTERNS = [
  { re: /\bINSERT\s+INTO\b/i, name: "INSERT INTO" },
  { re: /\bUPDATE\s+(accounting|mdata|bank|banking|catalogs|outbox|qbo|expense_attribution)\./i, name: "UPDATE <table>" },
  { re: /\bDELETE\s+FROM\b/i, name: "DELETE FROM" },
];

/** Slice a source string from a start marker up to the next of any stop markers (or EOF). */
function sliceBlock(src, startMarker, stopMarkers) {
  const start = src.indexOf(startMarker);
  if (start < 0) return null;
  let end = src.length;
  for (const stop of stopMarkers) {
    const idx = src.indexOf(stop, start + startMarker.length);
    if (idx >= 0 && idx < end) end = idx;
  }
  return src.slice(start, end);
}

const route = read(ROUTE);
if (route) {
  // (1) GET list registration present. (The create route legitimately POSTs the same path; this
  //     guard scopes read-only-ness to the GET list handler + its query helper, below.)
  if (!/app\.get\(\s*["'`]\/api\/v1\/expenses["'`]/.test(route)) {
    fail(`${ROUTE} must register the list endpoint as GET (app.get("/api/v1/expenses")).`);
  }

  // (2a) The shared query helper is SELECT-only.
  const helper = sliceBlock(route, "export async function queryExpensesList", [
    "\nexport async function ",
    "\nexport default",
    "\nexport function ",
  ]);
  if (!helper) {
    fail(`${ROUTE} is missing the queryExpensesList helper (the single read-only list query).`);
  } else {
    if (!/\bSELECT\b/i.test(helper)) fail(`queryExpensesList must contain a SELECT.`);
    for (const { re, name } of WRITE_PATTERNS) {
      if (re.test(helper)) fail(`queryExpensesList contains a write (${name}) — the expenses list must be read-only.`);
    }
  }

  // (2b) The GET handler body (up to the next route registration) is SELECT-only.
  const getHandler = sliceBlock(route, 'app.get("/api/v1/expenses"', [
    'app.post("/api/v1/expenses"',
    'app.put("/api/v1/expenses"',
    'app.patch("/api/v1/expenses"',
    'app.delete("/api/v1/expenses"',
  ]);
  if (!getHandler) {
    fail(`${ROUTE} GET /api/v1/expenses handler could not be located.`);
  } else {
    for (const { re, name } of WRITE_PATTERNS) {
      if (re.test(getHandler)) fail(`GET /api/v1/expenses handler contains a write (${name}) — the browse list must be read-only.`);
    }
    // (3) Entity-scoping + schema guard.
    if (!/withCompanyScope/.test(getHandler)) {
      fail(`GET /api/v1/expenses must read inside withCompanyScope (SET app.operating_company_id for RLS).`);
    }
    if (!/relationExists\(\s*client\s*,\s*["'`]accounting\.expenses["'`]/.test(getHandler)) {
      fail(`GET /api/v1/expenses must guard with relationExists(client, "accounting.expenses") before querying.`);
    }
    if (!/queryExpensesList\(/.test(getHandler)) {
      fail(`GET /api/v1/expenses must delegate to queryExpensesList (single-source read-only query).`);
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log("verify-expenses-list-readonly: OK — GET /api/v1/expenses is read-only + entity-scoped.");

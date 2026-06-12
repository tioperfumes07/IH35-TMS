#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const pass = (msg) => console.log(`[verify-c4] PASS: ${msg}`);
const fail = (msg) => { console.error(`[verify-c4] FAIL: ${msg}`); process.exit(1); };

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}
function check(rel, pattern, label) {
  const src = read(rel);
  if (!src) fail(`file missing: ${rel}`);
  if (!(pattern instanceof RegExp ? pattern.test(src) : src.includes(pattern)))
    fail(`${label} — not found in ${rel}`);
  pass(label);
}

// ── 1. Migration ──────────────────────────────────────────────────────────────
const MIG = "db/migrations/202606120500_c4_cust_vend_reclassify.sql";
const migSrc = read(MIG);
if (!migSrc) fail(`migration missing: ${MIG}`);
pass("migration exists");

["entity_classification", "qbo_classification_ref", "reclassified_at", "reclassified_by_user_id",
 "merge_target_id", "is_duplicate"].forEach(col => {
  if (!migSrc.includes(col)) fail(`migration missing column: ${col}`);
  pass(`migration column: ${col}`);
});

if (!migSrc.includes("entity_reclassification_log")) fail("entity_reclassification_log table missing");
pass("entity_reclassification_log table");

if (!migSrc.includes("NULLIF")) fail("NULLIF RLS pattern missing from migration");
pass("NULLIF RLS pattern");

if (!migSrc.includes("ENABLE ROW LEVEL SECURITY")) fail("RLS not enabled on reclassification_log");
pass("RLS enabled on reclassification_log");

if (migSrc.includes("DROP TABLE") || migSrc.includes("DROP COLUMN")) fail("migration has destructive DROP — must be additive only");
pass("no destructive DROPs in migration");

// ── 2. Reclassify routes ───────────────────────────────────────────────────────
const ROUTES = "apps/backend/src/mdata/reclassify.routes.ts";
const routesSrc = read(ROUTES);
if (!routesSrc) fail(`routes missing: ${ROUTES}`);
pass("reclassify routes file exists");

["/reclassify", "/flag-duplicate", "/reclassification-history"].forEach(endpoint => {
  if (!routesSrc.includes(endpoint)) fail(`missing endpoint: ${endpoint}`);
  pass(`endpoint present: ${endpoint}`);
});

if (!routesSrc.includes("category.reclassified")) fail("spine event category.reclassified not emitted");
pass("spine event: category.reclassified");

if (!routesSrc.includes("appendCrudAudit")) fail("appendCrudAudit not called in routes");
pass("appendCrudAudit called");

if (!routesSrc.includes("C4-CUST-VEND-REBUILD-RECLASSIFY")) fail("block tag C4-CUST-VEND-REBUILD-RECLASSIFY missing from spine emit");
pass("block tag in spine emit");

if (!routesSrc.includes("entity_reclassification_log")) fail("append-only log INSERT missing from routes");
pass("append-only log INSERT in routes");

if (!routesSrc.includes("classification_before")) fail("before/after payload missing in routes");
pass("before/after classification in spine payload");

// ── 3. No hard deletes ────────────────────────────────────────────────────────
if (/DELETE FROM mdata\.(customers|vendors)\b/i.test(routesSrc)) {
  fail("hard DELETE FROM mdata.customers/vendors found — must be soft-update only");
}
pass("no hard deletes in routes");

if (/DELETE FROM mdata\.entity_reclassification_log/i.test(routesSrc)) {
  fail("DELETE from append-only reclassification_log found — must be append-only");
}
pass("reclassification_log is append-only (no DELETE in routes)");

// ── 4. Role-gating ────────────────────────────────────────────────────────────
if (!routesSrc.includes("canReclassify")) fail("role-gate canReclassify missing");
pass("role-gate canReclassify present");

// ── 5. index.ts wires the routes ─────────────────────────────────────────────
check("apps/backend/src/index.ts", "registerReclassifyRoutes", "reclassify routes registered in index.ts");

// ── 6. Vendors route also covered ────────────────────────────────────────────
if (!/vendors.*reclassify|reclassify.*vendors/i.test(routesSrc) && !routesSrc.includes("mdata.vendors")) {
  fail("vendor reclassify route missing");
}
pass("vendor reclassify route present");

console.log("\n[verify-c4] ALL CHECKS PASSED");

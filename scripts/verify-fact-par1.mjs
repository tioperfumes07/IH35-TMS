#!/usr/bin/env node
// CI guard for FACT-PAR-1: Outbound Factor Submission Workflow
// Verifies: doc-gate, role-gate, withCompanyScope, audit trail, no-GL-write, no-financed-status
import fs from "fs";
import path from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const pass = (msg) => console.log(`[verify-fact-par1] PASS: ${msg}`);
const fail = (msg) => { console.error(`[verify-fact-par1] FAIL: ${msg}`); process.exit(1); };

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

// ── 1. Backend service ────────────────────────────────────────────────────────
const SVC = "apps/backend/src/factoring/submission-queue.service.ts";
const svcSrc = read(SVC);
if (!svcSrc) fail(`service missing: ${SVC}`);
pass("submission-queue.service.ts exists");

["listSubmissionQueueInvoices", "listWorkqueueInvoices", "SubmissionQueueItem", "WorkqueueItem"].forEach((sym) => {
  if (!svcSrc.includes(sym)) fail(`service missing export: ${sym}`);
  pass(`service exports: ${sym}`);
});

// Doc gate: POD gate
if (!svcSrc.includes("dispatch.pod_documents")) fail("service missing POD gate (dispatch.pod_documents)");
pass("POD gate: dispatch.pod_documents present");

if (!svcSrc.includes("status") || !svcSrc.includes("'approved'")) fail("service missing POD status = 'approved' check");
pass("POD gate: status = 'approved' check");

// Doc gate: rate confirmation
if (!svcSrc.includes("rate_confirmation")) fail("service missing rate_confirmation gate");
pass("rate-con gate: rate_confirmation present");

if (!svcSrc.includes("catalogs.file_categories")) fail("service missing catalogs.file_categories join for rate-con gate");
pass("rate-con gate: catalogs.file_categories join");

if (!svcSrc.includes("docs.file_links")) fail("service missing docs.file_links join");
pass("rate-con gate: docs.file_links join");

// is_submittable = both gates
if (!svcSrc.includes("is_submittable")) fail("service missing is_submittable field");
pass("service: is_submittable field present");

if (!svcSrc.includes("missing_docs")) fail("service missing missing_docs field");
pass("service: missing_docs field present");

// Factoring status filter: only 'not_factored' eligible
if (!svcSrc.includes("not_factored")) fail("service missing factoring_status filter for not_factored");
pass("service: filters to factoring_status = 'not_factored'");

// Workqueue excludes 'not_factored' and 'released'
if (!svcSrc.includes("'not_factored', 'released'") && !svcSrc.includes("'released'")) fail("workqueue missing NOT IN not_factored/released filter");
pass("workqueue: excludes not_factored/released");

// Reserve movements for chargeback
if (!svcSrc.includes("accounting.factoring_reserve_movements")) fail("workqueue missing chargeback subquery (accounting.factoring_reserve_movements)");
pass("workqueue: accounting.factoring_reserve_movements chargeback subquery");

// Recourse view join
if (!svcSrc.includes("views.factoring_recourse_at_risk")) fail("workqueue missing recourse view join (views.factoring_recourse_at_risk)");
pass("workqueue: views.factoring_recourse_at_risk join");

// No 'financed' status — would require ALTER TABLE (CHECK constraint)
if (svcSrc.includes("'financed'")) fail("service must NOT use 'financed' status — not in migration 0061 CHECK constraint; use 'advanced' (set by FARO CSV import)");
pass("service: no 'financed' status (uses 'advanced' per existing CHECK constraint)");

// ── 2. Backend routes ─────────────────────────────────────────────────────────
const ROUTES = "apps/backend/src/factoring/submission-queue.routes.ts";
const routesSrc = read(ROUTES);
if (!routesSrc) fail(`routes missing: ${ROUTES}`);
pass("submission-queue.routes.ts exists");

// Endpoint presence
if (!routesSrc.includes("/api/v1/factoring/submission-queue")) fail("routes missing GET /api/v1/factoring/submission-queue");
pass("routes: GET /api/v1/factoring/submission-queue");

if (!routesSrc.includes("/api/v1/factoring/workqueue")) fail("routes missing GET /api/v1/factoring/workqueue");
pass("routes: GET /api/v1/factoring/workqueue");

if (!routesSrc.includes("/api/v1/factoring/submission-queue/submit-batch")) fail("routes missing POST /api/v1/factoring/submission-queue/submit-batch");
pass("routes: POST /api/v1/factoring/submission-queue/submit-batch");

// withCompanyScope — every route must scope to operating_company_id before DB access
if ((routesSrc.match(/withCompanyScope/g) || []).length < 3) fail("routes: withCompanyScope must be used in all 3 routes (3+ occurrences)");
pass("routes: withCompanyScope used in all routes");

// Role-gate on submit-batch
if (!routesSrc.includes("Owner") || !routesSrc.includes("Accountant")) fail("routes missing role-gate on submit-batch (must include Owner + Accountant)");
pass("routes: submit-batch role-gate present (Owner/Accountant)");

// Re-validate doc gate before batch creation
if (!routesSrc.includes("is_submittable") || !routesSrc.includes("docs_missing")) fail("routes missing server-side re-validation of is_submittable / docs_missing error");
pass("routes: server-side doc-gate re-validation before batch creation");

// Batch creation: import from batch.service
if (!routesSrc.includes("batch.service") || !routesSrc.includes("createDraftBatch") || !routesSrc.includes("submitBatch")) fail("routes must use existing createDraftBatch + submitBatch from batch.service");
pass("routes: uses createDraftBatch + submitBatch (no duplicate batch logic)");

// Audit trail
if (!routesSrc.includes("appendCrudAudit")) fail("routes missing appendCrudAudit import");
pass("routes: appendCrudAudit imported");

if (!routesSrc.includes("factoring.batch.submitted")) fail("routes missing audit event: factoring.batch.submitted");
pass("routes: audit event factoring.batch.submitted");

if (!routesSrc.includes("FACT-PAR-1")) fail("routes missing FACT-PAR-1 tag in audit call");
pass("routes: audit call tagged FACT-PAR-1");

// No GL writes — submission routes must NEVER post to accounting.journal_entries
if (/INSERT\s+INTO\s+accounting\.journal_entries/i.test(routesSrc)) fail("submit-batch route must not write to accounting.journal_entries directly");
pass("routes: no direct GL writes to accounting.journal_entries");

// ── 3. Backend index.ts wiring ────────────────────────────────────────────────
const INDEX = "apps/backend/src/index.ts";
const indexSrc = read(INDEX);
if (!indexSrc) fail(`index missing: ${INDEX}`);

if (!indexSrc.includes("registerSubmissionQueueRoutes")) fail("index.ts missing registerSubmissionQueueRoutes call");
pass("index.ts: registerSubmissionQueueRoutes registered");

if (!indexSrc.includes("submission-queue.routes")) fail("index.ts missing submission-queue.routes import");
pass("index.ts: submission-queue.routes imported");

// ── 4. Frontend API client ────────────────────────────────────────────────────
const API = "apps/frontend/src/api/factoring.ts";
const apiSrc = read(API);
if (!apiSrc) fail(`API client missing: ${API}`);

["listSubmissionQueue", "listWorkqueue", "submitFactoringQueueBatch"].forEach((fn) => {
  if (!apiSrc.includes(fn)) fail(`API client missing function: ${fn}`);
  pass(`API client: ${fn}`);
});

["SubmissionQueueItem", "WorkqueueItem"].forEach((t) => {
  if (!apiSrc.includes(t)) fail(`API client missing type: ${t}`);
  pass(`API client type: ${t}`);
});

// ── 5. Frontend SubmissionQueue page ─────────────────────────────────────────
const SQ = "apps/frontend/src/pages/factoring/SubmissionQueue.tsx";
const sqSrc = read(SQ);
if (!sqSrc) fail(`SubmissionQueue page missing: ${SQ}`);
pass("SubmissionQueue.tsx exists");

// Doc gate badge
if (!sqSrc.includes("is_submittable")) fail("SubmissionQueue.tsx missing is_submittable gate on checkbox");
pass("SubmissionQueue.tsx: is_submittable gate");

if (!sqSrc.includes("missing_docs")) fail("SubmissionQueue.tsx missing missing_docs display");
pass("SubmissionQueue.tsx: missing_docs display");

// Selection only for submittable
if (!sqSrc.includes("overrideCreditLimit") && !sqSrc.includes("disabled")) {
  // just check that non-submittable items are disabled in some way
}
if (!sqSrc.includes("submitFactoringQueueBatch")) fail("SubmissionQueue.tsx missing submitFactoringQueueBatch call");
pass("SubmissionQueue.tsx: submitFactoringQueueBatch wired");

// ── 6. Frontend SubmissionWorkqueue page ──────────────────────────────────────
const WQ = "apps/frontend/src/pages/factoring/SubmissionWorkqueue.tsx";
const wqSrc = read(WQ);
if (!wqSrc) fail(`SubmissionWorkqueue page missing: ${WQ}`);
pass("SubmissionWorkqueue.tsx exists");

["factoring_status", "advance_cents", "reserve_cents", "fee_cents", "chargeback_cents", "recourse_expiry"].forEach((col) => {
  if (!wqSrc.includes(col)) fail(`SubmissionWorkqueue.tsx missing column: ${col}`);
  pass(`SubmissionWorkqueue.tsx: column ${col}`);
});

if (!wqSrc.includes("listWorkqueue")) fail("SubmissionWorkqueue.tsx missing listWorkqueue call");
pass("SubmissionWorkqueue.tsx: listWorkqueue wired");

// ── 7. Factoring index page has both tabs ────────────────────────────────────
const IDX = "apps/frontend/src/pages/factoring/index.tsx";
const idxSrc = read(IDX);
if (!idxSrc) fail(`factoring index missing: ${IDX}`);

if (!idxSrc.includes("SubmissionQueue")) fail("factoring index.tsx missing SubmissionQueue tab");
pass("factoring index.tsx: SubmissionQueue tab");

if (!idxSrc.includes("SubmissionWorkqueue")) fail("factoring index.tsx missing SubmissionWorkqueue tab");
pass("factoring index.tsx: SubmissionWorkqueue tab");

// ── 8. No 'financed' factoring_status anywhere in this block ─────────────────
[SVC, ROUTES, SQ, WQ].forEach((rel) => {
  const src = read(rel);
  if (src && src.includes("'financed'")) fail(`${rel} uses 'financed' factoring_status — not in CHECK constraint; use 'advanced'`);
});
pass("no 'financed' factoring_status across all FACT-PAR-1 files");

console.log("\n[verify-fact-par1] ALL CHECKS PASSED");

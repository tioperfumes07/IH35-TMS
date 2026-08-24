#!/usr/bin/env node
/**
 * GUARD: cash-flow manual adjustments must have a real void path — the backend service+route,
 * the frontend API client, and the "Remove" button in DailyPredictionTab.tsx must all exist and
 * be wired together. Never let a create-only flow ship with no way to undo a mistake.
 *
 * ROOT CAUSE this freezes shut: accounting.cash_flow_adjustments has carried an `archived_at`
 * column + a "ARCHIVE never DELETE" migration comment since the table was created
 * (202606080200_cash_flow_adjustments.sql), but no route, service function, API client method, or
 * UI control ever set it — live-confirmed on USMCA: creating a manual cash-flow adjustment left
 * it permanently on the day's projection with no product-level way to remove it (not just a
 * missing button — `grep app\\.(get|post|patch|delete)` on cash-flow.routes.ts showed only GET
 * and POST, zero write path for removal at all). Found while live-exercising /cash-flow's own
 * "ADD CASH-FLOW ADJUSTMENT" create flow per the U14 leftover-sequence claim; the test row this
 * created had to be voided directly via Neon since no API path existed at the time.
 *
 * Static-only (text-pattern) check across all four files in the chain:
 *   1. cash-flow.service.ts: archiveAdjustment() does UPDATE ... SET archived_at = now() ...
 *      WHERE archived_at IS NULL (idempotent — can't double-archive).
 *   2. cash-flow.routes.ts: a PATCH .../adjustments/:id/archive route calls archiveAdjustment.
 *   3. api/cashFlow.ts: archiveCashFlowAdjustment() calls the PATCH .../archive endpoint.
 *   4. DailyPredictionTab.tsx: an archiveMutation calling archiveCashFlowAdjustment exists, and a
 *      "Remove" button (data-testid="cash-flow-adjustment-remove") wired to it appears later in
 *      the same file (position-ordering, not a regex window — the gap between the hook
 *      declaration and its JSX usage in a 490-line component is far too wide for one safe fixed
 *      window, per the regex-window-too-small landmines hit earlier this session).
 *
 * Run:  node scripts/verify-cash-flow-adjustment-archive-wired.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE_PATH = path.join(root, "apps/backend/src/cash-flow/cash-flow.service.ts");
const ROUTES_PATH = path.join(root, "apps/backend/src/cash-flow/cash-flow.routes.ts");
const API_PATH = path.join(root, "apps/frontend/src/api/cashFlow.ts");
const TAB_PATH = path.join(root, "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx");
const LABEL = "verify-cash-flow-adjustment-archive-wired";

const SERVICE_RE =
  /export async function archiveAdjustment[\s\S]{0,400}UPDATE accounting\.cash_flow_adjustments[\s\S]{0,200}SET archived_at = now\(\)[\s\S]{0,200}WHERE[\s\S]{0,200}archived_at IS NULL/;
const API_RE =
  /export function archiveCashFlowAdjustment[\s\S]{0,400}\/archive[\s\S]{0,200}method: "PATCH"/;

export function checkCashFlowAdjustmentArchiveWired(serviceSrc, routesSrc, apiSrc, tabSrc) {
  const problems = [];

  if (!SERVICE_RE.test(serviceSrc)) {
    problems.push(
      "cash-flow.service.ts has no archiveAdjustment() doing an idempotent UPDATE ... SET archived_at = now() ... WHERE archived_at IS NULL"
    );
  }

  const routeIdx = routesSrc.indexOf('app.patch("/api/v1/cash-flow/adjustments/:id/archive"');
  const routeCallIdx = routeIdx === -1 ? -1 : routesSrc.indexOf("archiveAdjustment(client", routeIdx);
  if (routeIdx === -1 || routeCallIdx === -1 || routeCallIdx - routeIdx > 2000) {
    problems.push(
      "cash-flow.routes.ts has no PATCH /api/v1/cash-flow/adjustments/:id/archive route calling archiveAdjustment"
    );
  }

  if (!API_RE.test(apiSrc)) {
    problems.push(
      "api/cashFlow.ts has no archiveCashFlowAdjustment() calling the PATCH .../archive endpoint"
    );
  }

  const mutIdx = tabSrc.indexOf("const archiveMutation = useMutation");
  const mutCallIdx = mutIdx === -1 ? -1 : tabSrc.indexOf("archiveCashFlowAdjustment(", mutIdx);
  const btnIdx = mutIdx === -1 ? -1 : tabSrc.indexOf('data-testid="cash-flow-adjustment-remove"', mutIdx);
  const onClickIdx = mutIdx === -1 ? -1 : tabSrc.indexOf("archiveMutation.mutate(item.adjustment_id", mutIdx);
  const mutBlock = mutIdx === -1 ? "" : tabSrc.slice(mutIdx, mutIdx + 500);
  const hasOnError = /onError\s*:/.test(mutBlock);
  const errIdx = tabSrc.indexOf('data-testid="cash-flow-adjustment-archive-error"');
  if (
    mutIdx === -1 ||
    mutCallIdx === -1 ||
    mutCallIdx - mutIdx > 400 ||
    btnIdx === -1 ||
    onClickIdx === -1 ||
    btnIdx <= mutIdx ||
    onClickIdx <= mutIdx
  ) {
    problems.push(
      "DailyPredictionTab.tsx has no archiveMutation wired to a Remove button — a mistaken manual adjustment could still be created but never removed from the UI"
    );
  } else if (!hasOnError || errIdx === -1) {
    problems.push(
      "DailyPredictionTab.tsx archiveMutation has no onError + visible archive-error — Remove fail is a silent no-op"
    );
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const badService = `
    export async function addAdjustment(client, input) {
      return client.query("INSERT INTO accounting.cash_flow_adjustments ...");
    }
  `;
  const badRoutes = `
    app.post("/api/v1/cash-flow/adjustments", async (req, reply) => {
      const row = await addAdjustment(client, ...);
      return reply.status(201).send(row);
    });
  `;
  const badApi = `
    export function addCashFlowAdjustment(payload) {
      return apiRequest("/api/v1/cash-flow/adjustments", { method: "POST", body: payload });
    }
  `;
  const badTab = `
    const mutation = useMutation({ mutationFn: (payload) => addCashFlowAdjustment({...payload}) });
    {data?.expense_items.map((item) => (
      <div key={item.adjustment_id}>
        <span>{item.label}</span>
        <span>{item.amount_cents}</span>
      </div>
    ))}
  `;
  const badProblems = checkCashFlowAdjustmentArchiveWired(badService, badRoutes, badApi, badTab);
  if (badProblems.length !== 4) {
    failures.push(
      `the real pre-fix defect verbatim expected 4 problems, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const goodService = fs.readFileSync(SERVICE_PATH, "utf8");
  const goodRoutes = fs.readFileSync(ROUTES_PATH, "utf8");
  const goodApi = fs.readFileSync(API_PATH, "utf8");
  const goodTab = fs.readFileSync(TAB_PATH, "utf8");
  const goodProblems = checkCashFlowAdjustmentArchiveWired(goodService, goodRoutes, goodApi, goodTab);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed files were flagged: ${goodProblems.join("; ")}`);
  }

  // Partial fix: backend fully wired, frontend button still missing — proves the checks are
  // independent across files.
  const partialProblems = checkCashFlowAdjustmentArchiveWired(goodService, goodRoutes, goodApi, badTab);
  if (partialProblems.length !== 1) {
    failures.push(
      `a partial fix (backend wired, frontend button missing) expected 1 problem, got ${partialProblems.length}: ${partialProblems.join("; ")}`
    );
  }

  const silentTab = goodTab.replace(/onError:\s*\(e\)\s*=>\s*\{[\s\S]*?\},\n/, "");
  const silentProblems = checkCashFlowAdjustmentArchiveWired(goodService, goodRoutes, goodApi, silentTab);
  if (!silentProblems.some((p) => /silent no-op/.test(p))) {
    failures.push(
      `stripping archive onError must fail as silent no-op, got: ${silentProblems.join("; ") || "none"}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (4/4), the real fixed files clear, a ` +
      `partial fix (backend only) caught (1/1).`
  );
  process.exit(0);
}

const serviceSrc = fs.readFileSync(SERVICE_PATH, "utf8");
const routesSrc = fs.readFileSync(ROUTES_PATH, "utf8");
const apiSrc = fs.readFileSync(API_PATH, "utf8");
const tabSrc = fs.readFileSync(TAB_PATH, "utf8");
const problems = checkCashFlowAdjustmentArchiveWired(serviceSrc, routesSrc, apiSrc, tabSrc);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — cash-flow manual adjustments have a real void path end-to-end (service, route, API client, and a wired Remove button).`
);

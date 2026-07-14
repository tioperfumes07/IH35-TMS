#!/usr/bin/env node
/**
 * COMPLIANCE-G1/G2 guard — the Compliance module's "Violations" and "HOS History" tabs were EMPTY
 * STUBS (a static <ComplianceEmptyState/> placeholder, no data fetch). This guard locks that they stay
 * wired to real, already-registered backend endpoints:
 *   - Violations   → GET /api/v1/safety/hos-violations (safety.hos_violations), reused via the existing
 *                    HOSViolationsTab component (same one the Safety module renders — no duplicate fetch).
 *   - HOS History  → GET /api/v1/telematics/hos/events (raw hos.duty_status_events over a date range),
 *                    via the new HosHistorySection + api/hosTracker.ts's getHosEvents().
 * Locks on apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx +
 * apps/frontend/src/pages/compliance/HosHistorySection.tsx + apps/frontend/src/api/hosTracker.ts:
 *   (1) the "violations" tab branch renders <HOSViolationsTab /> (not a static empty-state stub).
 *   (2) the "hos_history" tab branch renders <HosHistorySection .../> (not a static empty-state stub).
 *   (3) HosHistorySection actually calls getHosEvents (a real query, not a hardcoded placeholder).
 *   (4) api/hosTracker.ts's getHosEvents hits the real, backend-registered /api/v1/telematics/hos/events.
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-compliance-violations-hos-wired";

const PAGE_FILE = "apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx";
const HISTORY_FILE = "apps/frontend/src/pages/compliance/HosHistorySection.tsx";
const API_FILE = "apps/frontend/src/api/hosTracker.ts";
const BACKEND_ROUTES_FILE = "apps/backend/src/telematics/hos-tracker.routes.ts";
const BACKEND_INDEX_FILE = "apps/backend/src/index.ts";

export function assertGuard({ page, history, api, backendRoutes, backendIndex }) {
  const errs = [];

  // (1) Violations tab wired to the existing HOSViolationsTab, not an empty-state stub.
  if (!/import\s*\{\s*HOSViolationsTab\s*\}\s*from\s*["'].*HOSViolationsTab["']/.test(page))
    errs.push(`${PAGE_FILE}: must import HOSViolationsTab (reuse the existing Safety module component, not a duplicate fetch)`);
  const violationsBranch = /tab === "violations"[\s\S]{0,300}?\)\s*:\s*null/.exec(page)?.[0] ?? "";
  if (!/<HOSViolationsTab\s*\/>/.test(violationsBranch))
    errs.push(`${PAGE_FILE}: the "violations" tab branch must render <HOSViolationsTab /> (found an empty-state stub or nothing)`);

  // (2) HOS History tab wired to HosHistorySection, not an empty-state stub.
  if (!/import\s*\{\s*HosHistorySection\s*\}\s*from\s*["']\.\/HosHistorySection["']/.test(page))
    errs.push(`${PAGE_FILE}: must import HosHistorySection`);
  const historyBranch = /tab === "hos_history"[\s\S]{0,300}?\)\s*:\s*null/.exec(page)?.[0] ?? "";
  if (!/<HosHistorySection\b/.test(historyBranch))
    errs.push(`${PAGE_FILE}: the "hos_history" tab branch must render <HosHistorySection .../> (found an empty-state stub or nothing)`);

  // (3) HosHistorySection must actually call the real fetcher, not hardcode a placeholder message.
  if (!/getHosEvents\(/.test(history))
    errs.push(`${HISTORY_FILE}: must call getHosEvents(...) — a real data fetch, not a static placeholder`);
  if (!/useQuery/.test(history))
    errs.push(`${HISTORY_FILE}: must use useQuery to fetch (not render static/hardcoded rows)`);

  // (4) api/hosTracker.ts's getHosEvents must hit the real backend-registered endpoint.
  if (!/export function getHosEvents/.test(api))
    errs.push(`${API_FILE}: must export getHosEvents(...)`);
  if (!/\/api\/v1\/telematics\/hos\/events/.test(api))
    errs.push(`${API_FILE}: getHosEvents must call /api/v1/telematics/hos/events`);

  // The endpoint must exist in the backend route file and be registered in index.ts (not a phantom route).
  if (!/"\/api\/v1\/telematics\/hos\/events"/.test(backendRoutes))
    errs.push(`${BACKEND_ROUTES_FILE}: must expose GET /api/v1/telematics/hos/events`);
  if (!/registerHosTrackerRoutes/.test(backendIndex))
    errs.push(`${BACKEND_INDEX_FILE}: registerHosTrackerRoutes must be registered (route would 404 otherwise)`);

  return errs;
}

function selftest() {
  const goodPage = `
    import { HOSViolationsTab } from "../safety/tabs/HOSViolationsTab";
    import { HosHistorySection } from "./HosHistorySection";
    {tab === "violations" ? (
      <section><HOSViolationsTab /></section>
    ) : null}
    {tab === "hos_history" ? (
      <HosHistorySection operatingCompanyId={companyId} />
    ) : null}
  `;
  const badPage = `
    {tab === "violations" ? (
      <ComplianceEmptyState title="Violations" message="No HOS violations in range." />
    ) : null}
    {tab === "hos_history" ? (
      <ComplianceEmptyState title="HOS History" message="No HOS history in this range." />
    ) : null}
  `;
  const goodHistory = `useQuery({ queryFn: () => getHosEvents(operatingCompanyId, driverId, from, to) });`;
  const badHistory = `function HosHistorySection() { return <div>No HOS history in this range.</div>; }`;
  const goodApi = `export function getHosEvents(a,b,c,d) { return apiRequest(\`/api/v1/telematics/hos/events?x\`); }`;
  const badApi = `export function getHosEvents() {}`;
  const goodRoutes = `app.get("/api/v1/telematics/hos/events", async (req, reply) => {});`;
  const badRoutes = `app.get("/api/v1/telematics/hos/daily", async (req, reply) => {});`;
  const goodIndex = `await registerHosTrackerRoutes(app);`;
  const badIndex = `// not registered`;

  const cases = [
    { n: "fully wired → 0", in: { page: goodPage, history: goodHistory, api: goodApi, backendRoutes: goodRoutes, backendIndex: goodIndex }, want: 0 },
    { n: "empty stubs still in page → flag", in: { page: badPage, history: goodHistory, api: goodApi, backendRoutes: goodRoutes, backendIndex: goodIndex }, min: 4 },
    { n: "history section hardcoded (no fetch) → flag", in: { page: goodPage, history: badHistory, api: goodApi, backendRoutes: goodRoutes, backendIndex: goodIndex }, min: 2 },
    { n: "api getHosEvents not wired to endpoint → flag", in: { page: goodPage, history: goodHistory, api: badApi, backendRoutes: goodRoutes, backendIndex: goodIndex }, min: 1 },
    { n: "backend route missing → flag", in: { page: goodPage, history: goodHistory, api: goodApi, backendRoutes: badRoutes, backendIndex: goodIndex }, min: 1 },
    { n: "backend route not registered in index → flag", in: { page: goodPage, history: goodHistory, api: goodApi, backendRoutes: goodRoutes, backendIndex: badIndex }, min: 1 },
  ];
  let f = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) f++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (f) { console.error(`\n${LABEL} SELFTEST FAILED: ${f}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const files = {
  page: PAGE_FILE,
  history: HISTORY_FILE,
  api: API_FILE,
  backendRoutes: BACKEND_ROUTES_FILE,
  backendIndex: BACKEND_INDEX_FILE,
};
const missing = Object.values(files).filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) { console.error(`[${LABEL}] FAILED — missing file(s): ${missing.join(", ")}`); process.exit(1); }

const errs = assertGuard({
  page: fs.readFileSync(path.join(ROOT, PAGE_FILE), "utf8"),
  history: fs.readFileSync(path.join(ROOT, HISTORY_FILE), "utf8"),
  api: fs.readFileSync(path.join(ROOT, API_FILE), "utf8"),
  backendRoutes: fs.readFileSync(path.join(ROOT, BACKEND_ROUTES_FILE), "utf8"),
  backendIndex: fs.readFileSync(path.join(ROOT, BACKEND_INDEX_FILE), "utf8"),
});
if (errs.length) { console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`); for (const e of errs) console.error(`  ✗ ${e}`); process.exit(1); }
console.log(`[${LABEL}] OK — Violations tab → HOSViolationsTab (/api/v1/safety/hos-violations); HOS History tab → HosHistorySection (/api/v1/telematics/hos/events), both real registered endpoints.`);

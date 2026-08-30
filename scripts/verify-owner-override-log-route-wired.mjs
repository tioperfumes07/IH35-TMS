#!/usr/bin/env node
/**
 * verify-owner-override-log-route-wired.mjs  (DISPATCH-F6251-OWNER-OVERRIDE-LOG)
 *
 * Root cause: the critical "Owner override — driver qualification (CDL / DOT medical)" notification
 * (apps/backend/src/outbox/handlers/dispatch-override-notice.handler.ts) has pointed its
 * `action_link` at `/dispatch/owner-override-log` since 2026-08-02, and the read-only WORM-audit
 * backend endpoint `GET /api/v1/dispatch/owner-override-log` (dispatch-refinements.routes.ts) has
 * existed the same length of time — but until this fix, NO frontend route or page consumed either
 * one. Clicking "Open" on that notification silently fell through the React Router catch-all
 * (`<Route path="*" element={<Navigate to="/" replace />} />`) to the generic dashboard, on every
 * DOT-qualification override, for every Owner, since the notification shipped — a dead CTA on a
 * critical safety-compliance transparency control.
 *
 * This guard makes the regression impossible to re-ship: the frontend route manifest must register
 * a `/dispatch/owner-override-log` route, and the page component it points to must actually call
 * the backend endpoint (not just render a static placeholder).
 *
 * Usage:
 *   node scripts/verify-owner-override-log-route-wired.mjs            # scan
 *   node scripts/verify-owner-override-log-route-wired.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const MANIFEST_FILE = "apps/frontend/src/routes/manifest.tsx";
const PAGE_FILE = "apps/frontend/src/pages/dispatch/OwnerOverrideLogPage.tsx";
const API_FILE = "apps/frontend/src/api/dispatch.ts";
const BACKEND_FILE = "apps/backend/src/audit/dispatch-overrides.routes.ts";

const ROUTE_RE = /path="\/dispatch\/owner-override-log"/;
const API_CALL_RE = /listOwnerOverrideLog/;
const ENDPOINT_RE = /\/api\/v1\/dispatch\/owner-override-log/;
const COMPLETE_HISTORY_PATTERNS = [
  /queryKey:\s*\["dispatch",\s*"owner-override-log",\s*companyId,\s*offset\]/,
  /listOwnerOverrideLog\(companyId,\s*\{\s*limit:\s*pageSize,\s*offset\s*\}\)/,
  /const total = logQ\.data\?\.total \?\? 0/,
  /data-testid="owner-override-log-server-pager"/,
  /logQ\.isLoading[\s\S]{0,80}"Loading overrides…"/,
  /logQ\.isError[\s\S]{0,80}"Override history unavailable"/,
  /offset \+ pageSize >= total/,
  /hidePager/,
];

export function checkOwnerOverrideLogWired({ manifestSrc, apiSrc, pageExists, pageSrc, backendSrc }) {
  const offenders = [];
  if (!ROUTE_RE.test(manifestSrc)) {
    offenders.push(
      `${MANIFEST_FILE}: no route registered for /dispatch/owner-override-log — the critical DOT-qualification override notification's action_link has no matching route, so "Open" falls through the catch-all to "/"`
    );
  }
  if (!pageExists) {
    offenders.push(`${PAGE_FILE}: page component not found`);
  } else if (!API_CALL_RE.test(pageSrc)) {
    offenders.push(`${PAGE_FILE}: page does not call listOwnerOverrideLog — looks like a placeholder, not a real consumer of the backend endpoint`);
  } else {
    for (const pattern of COMPLETE_HISTORY_PATTERNS) {
      if (!pattern.test(pageSrc)) {
        offenders.push(`${PAGE_FILE}: owner-override WORM history is not server-paged from the authoritative total/offset; older overrides can disappear silently (${pattern})`);
      }
    }
  }
  if (!ENDPOINT_RE.test(apiSrc)) {
    offenders.push(`${API_FILE}: no client function calling GET /api/v1/dispatch/owner-override-log`);
  }
  if (!/FROM audit\.audit_events/.test(backendSrc ?? "")) {
    offenders.push(`${BACKEND_FILE}: canonical audit-events query is missing`);
  } else if (/FROM audit\.audit_events[\s\S]{0,500}?\.catch\s*\(/.test(backendSrc)) {
    offenders.push(`${BACKEND_FILE}: audit query failure is converted to a false empty override history`);
  }
  if (!/\/api\/v1\/audit\/dispatch-overrides[\s\S]{0,180}?rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/.test(backendSrc ?? "")) {
    offenders.push(`${BACKEND_FILE}: authenticated override audit route lacks the canonical rate limit`);
  }
  return offenders;
}

export function run() {
  const manifestSrc = fs.readFileSync(path.join(repoRoot, MANIFEST_FILE), "utf8");
  const apiSrc = fs.readFileSync(path.join(repoRoot, API_FILE), "utf8");
  const pageAbs = path.join(repoRoot, PAGE_FILE);
  const pageExists = fs.existsSync(pageAbs);
  const pageSrc = pageExists ? fs.readFileSync(pageAbs, "utf8") : "";
  const backendSrc = fs.readFileSync(path.join(repoRoot, BACKEND_FILE), "utf8");
  const offenders = checkOwnerOverrideLogWired({ manifestSrc, apiSrc, pageExists, pageSrc, backendSrc });
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const realBackend = fs.readFileSync(path.join(repoRoot, BACKEND_FILE), "utf8");
  const buggy = { manifestSrc: `<Route path="/dispatch/assignment-history" element={<AssignmentHistoryPage />} />`, apiSrc: `export function listDispatchAssignmentHistory() {}`, pageExists: false, pageSrc: "", backendSrc: realBackend };
  const fixed = {
    manifestSrc: `<Route path="/dispatch/owner-override-log" element={<OwnerOverrideLogPage />} />`,
    apiSrc: `export function listOwnerOverrideLog(id) { return apiRequest(\`/api/v1/dispatch/owner-override-log?operating_company_id=\${id}\`); }`,
    pageExists: true,
    pageSrc: `import { listOwnerOverrideLog } from "../../api/dispatch";
      export function OwnerOverrideLogPage() {
        const pageSize = 100; const offset = 0; const logQ = { data: { total: 1 } };
        listOwnerOverrideLog(companyId, { limit: pageSize, offset });
        const query = { queryKey: ["dispatch", "owner-override-log", companyId, offset] };
        const total = logQ.data?.total ?? 0;
        return <><ParityTable hidePager /><div data-testid="owner-override-log-server-pager">{logQ.isLoading ? "Loading overrides…" : logQ.isError ? "Override history unavailable" : offset + pageSize >= total}</div></>;
      }`,
    backendSrc: realBackend,
  };

  const buggyFails = checkOwnerOverrideLogWired(buggy).length > 0;
  const fixedPasses = checkOwnerOverrideLogWired(fixed).length === 0;
  const swallowed = {
    ...fixed,
    backendSrc: realBackend.replace("          values\n        );", "          values\n        ).catch(() => ({ rows: [] }));"),
  };
  const swallowFails = checkOwnerOverrideLogWired(swallowed).some((item) => item.includes("false empty override history"));
  const unbounded = { ...fixed, backendSrc: realBackend.replace('{ config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', "") };
  const rateLimitFails = checkOwnerOverrideLogWired(unbounded).some((item) => item.includes("lacks the canonical rate limit"));
  const silentlyCapped = { ...fixed, pageSrc: fixed.pageSrc.replace(', offset]', ']') };
  const capFails = checkOwnerOverrideLogWired(silentlyCapped).some((item) => item.includes("not server-paged"));
  const falseEmptyPager = { ...fixed, pageSrc: fixed.pageSrc.replace('logQ.isLoading ? "Loading overrides…" : logQ.isError ? "Override history unavailable" : ', "") };
  const falseEmptyFails = checkOwnerOverrideLogWired(falseEmptyPager).some((item) => item.includes("not server-paged"));

  if (buggyFails && fixedPasses && swallowFails && rateLimitFails && capFails && falseEmptyFails) {
    console.log("verify:owner-override-log-route-wired selftest OK (route + query-swallow + silent-cap + false-empty pager mutations caught)");
    process.exit(0);
  }
  console.error("verify:owner-override-log-route-wired selftest FAILED", { buggyFails, fixedPasses, swallowFails, rateLimitFails, capFails, falseEmptyFails });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:owner-override-log-route-wired FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:owner-override-log-route-wired OK — /dispatch/owner-override-log route + page + API client are all wired to the real backend endpoint");
}

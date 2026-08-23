#!/usr/bin/env node
/**
 * SAF-ORPH-05 / Leave Balances — office tab must list catalogs.driver_leave_balances
 * per driver (not policy-only "follow-on PR" chrome).
 *
 * Also locks the CI thrash class from Cursor #4198 tip commits:
 *   - GET /scheduler/balances must set config.rateLimit (CodeQL js/missing-rate-limiting)
 *   - error chrome must stay §7 nonfinancial slate (no amber/emerald)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");

const PAGE = "apps/frontend/src/pages/safety/driver-scheduler/DriverLeaveBalancesPage.tsx";
const API = "apps/frontend/src/api/driver-scheduler.ts";
const ROUTES = "apps/backend/src/safety/driver-scheduler.routes.ts";
const SERVICE = "apps/backend/src/safety/driver-scheduler.service.ts";

function assert(files) {
  const problems = [];
  const page = files[PAGE];
  const api = files[API];
  const routes = files[ROUTES];
  const service = files[SERVICE];

  if (/follow-on PR/i.test(page)) {
    problems.push(`${PAGE}: must not defer driver-level balances to a follow-on PR`);
  }
  if (!/listBalances|scheduler\/balances/.test(page)) {
    problems.push(`${PAGE}: must call listBalances /scheduler/balances`);
  }
  if (!/EntityLink/.test(page) || !/kind=\"driver\"/.test(page)) {
    problems.push(`${PAGE}: driver column must use EntityLink kind=driver`);
  }
  if (!/useNavigate/.test(page) || !page.includes('onClick={() => navigate(`/drivers/${row.driver_id}`)}')) {
    problems.push(`${PAGE}: live driver link must explicitly navigate to the canonical driver profile`);
  }
  if (!/policyQuery\.isError[\s\S]*onRetry=\{\(\) => void policyQuery\.refetch\(\)\}/.test(page)) {
    problems.push(`${PAGE}: failed company policy GET must expose its exact retry`);
  }
  if (!/balancesQuery\.isError[\s\S]*onRetry=\{\(\) => void balancesQuery\.refetch\(\)\}/.test(page)) {
    problems.push(`${PAGE}: failed company balance GET must expose its exact retry`);
  }
  if (/Confirm a leave policy exists/.test(page)) {
    problems.push(`${PAGE}: transport failures must not be misdiagnosed as missing policy configuration`);
  }
  if (/\b(amber|emerald|yellow)-\d{2,3}\b/.test(page)) {
    problems.push(`${PAGE}: §7 nonfinancial — no amber/emerald/yellow status classes on Leave Balances`);
  }
  if (!/listBalances/.test(api) || !/\/api\/v1\/safety\/scheduler\/balances/.test(api)) {
    problems.push(`${API}: must expose listBalances → GET /api/v1/safety/scheduler/balances`);
  }
  if (!/\/api\/v1\/safety\/scheduler\/balances/.test(routes) || !/listLeaveBalances/.test(routes)) {
    problems.push(`${ROUTES}: must mount GET /api/v1/safety/scheduler/balances via listLeaveBalances`);
  }
  // Rate-limit must appear in the same registration as /scheduler/balances (CodeQL).
  const balIdx = routes.indexOf('/api/v1/safety/scheduler/balances');
  if (balIdx < 0) {
    problems.push(`${ROUTES}: missing /api/v1/safety/scheduler/balances`);
  } else {
    const window = routes.slice(balIdx, balIdx + 500);
    if (!/\brateLimit\s*:/.test(window)) {
      problems.push(
        `${ROUTES}: GET /scheduler/balances must set config.rateLimit (CodeQL js/missing-rate-limiting)`,
      );
    }
  }
  if (!/export async function listLeaveBalances/.test(service)) {
    problems.push(`${SERVICE}: must export listLeaveBalances`);
  }
  if (!/catalogs\.driver_leave_balances/.test(service) || !/vacation_remaining/.test(service)) {
    problems.push(`${SERVICE}: listLeaveBalances must read catalogs.driver_leave_balances with remaining cols`);
  }
  return problems;
}

const files = Object.fromEntries(
  [PAGE, API, ROUTES, SERVICE].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")])
);

if (SELFTEST) {
  const plantedList = { ...files, [PAGE]: files[PAGE].replace(/listBalances/g, "getPolicyOnly") };
  const caughtList = assert(plantedList);
  if (!caughtList.some((p) => p.includes("listBalances"))) {
    console.error("SELFTEST FAIL — planted listBalances defect not caught");
    process.exit(1);
  }
  const plantedRl = {
    ...files,
    [ROUTES]: files[ROUTES].replace(
      /\/api\/v1\/safety\/scheduler\/balances[\s\S]{0,400}?rateLimit\s*:\s*\{[^}]+\}/,
      '/api/v1/safety/scheduler/balances"',
    ),
  };
  // If replace failed (pattern drift), strip rateLimit near balances another way
  let routesNoRl = plantedRl[ROUTES];
  if (/\brateLimit\s*:/.test(routesNoRl.slice(routesNoRl.indexOf("/api/v1/safety/scheduler/balances"), routesNoRl.indexOf("/api/v1/safety/scheduler/balances") + 500))) {
    routesNoRl = files[ROUTES].replace(
      `{ config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },`,
      `/* rateLimit removed for selftest */`,
    );
    // Only remove the first occurrence after balances path
    const i = files[ROUTES].indexOf("/api/v1/safety/scheduler/balances");
    const before = files[ROUTES].slice(0, i);
    const after = files[ROUTES].slice(i).replace(
      `{ config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },`,
      `{},`,
    );
    routesNoRl = before + after;
  }
  const caughtRl = assert({ ...files, [ROUTES]: routesNoRl });
  if (!caughtRl.some((p) => /rateLimit/i.test(p))) {
    console.error("SELFTEST FAIL — planted rateLimit defect not caught\n" + caughtRl.join("\n"));
    process.exit(1);
  }
  const plantedAmber = {
    ...files,
    [PAGE]: `${files[PAGE]}\nconst plantedPaletteDefect = "text-amber-600";`,
  };
  const caughtAmber = assert(plantedAmber);
  if (!caughtAmber.some((p) => /amber|§7/i.test(p))) {
    console.error("SELFTEST FAIL — planted amber palette defect not caught");
    process.exit(1);
  }
  const plantedDeadLink = {
    ...files,
    [PAGE]: files[PAGE].replace('onClick={() => navigate(`/drivers/${row.driver_id}`)}', ""),
  };
  const caughtDeadLink = assert(plantedDeadLink);
  if (!caughtDeadLink.some((p) => /explicitly navigate/i.test(p))) {
    console.error("SELFTEST FAIL — planted dead driver link not caught");
    process.exit(1);
  }
  const plantedPolicyRetry = {
    ...files,
    [PAGE]: files[PAGE].replace("onRetry={() => void policyQuery.refetch()}", ""),
  };
  if (!assert(plantedPolicyRetry).some((p) => /policy GET.*exact retry/i.test(p))) {
    console.error("SELFTEST FAIL — planted policy retry defect not caught");
    process.exit(1);
  }
  const plantedBalancesRetry = {
    ...files,
    [PAGE]: files[PAGE].replace("onRetry={() => void balancesQuery.refetch()}", ""),
  };
  if (!assert(plantedBalancesRetry).some((p) => /balance GET.*exact retry/i.test(p))) {
    console.error("SELFTEST FAIL — planted balances retry defect not caught");
    process.exit(1);
  }
  const live = assert(files);
  if (live.length) {
    console.error("SELFTEST FAIL — live unclean:\n" + live.join("\n"));
    process.exit(1);
  }
  console.log("verify-saf-leave-balances-driver-list SELFTEST PASS");
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error("verify-saf-leave-balances-driver-list FAIL\n" + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log("verify-saf-leave-balances-driver-list OK — Leave Balances lists catalogs.driver_leave_balances");

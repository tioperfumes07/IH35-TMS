#!/usr/bin/env node
/**
 * GUARD: DRV-F6179 — driver PWA message WRITES must be able to target a shared/authorized company,
 * not always the driver's home company.
 *
 * ROOT CAUSE this freezes shut: DRV-F6178 (merged f7d0b7d604) fixed the PWA GET
 * (listDriverPwaMessages) to return messages from every company the driver is authorized for, home
 * or shared. The two write endpoints — POST /api/v1/driver/messages (reply) and PATCH
 * /api/v1/driver/messages/:messageId/read (mark-read) — still derived the acting company from ONLY
 * `mdata.drivers.operating_company_id` (home company), with no way to receive/validate a different
 * target. Result: a shared driver marking a non-home-company message read got a 404 (dead click,
 * since markMessageRead's own predicate correctly requires `m.operating_company_id = $2` and $2 was
 * always home); replying silently inserted the reply into the WRONG (home-company) thread instead
 * of erroring — a silent misroute, not a visible failure, so nobody notices.
 *
 * FOUR checks, each targeting one part of the fix so a partial regression is still caught:
 *   (a) messages.service.ts exports assertDriverActingCompany with the home-OR-active-canonical-
 *       authorization predicate (the same shape markMessageRead / deliverDriverProfileMessage
 *       already use for reads/delivery).
 *   (b) messages.routes.ts's POST /api/v1/driver/messages calls assertDriverActingCompany when a
 *       caller-supplied operating_company_id is present (never trusts it outright).
 *   (c) messages.routes.ts's PATCH /api/v1/driver/messages/:messageId/read does the same.
 *   (d) the driver-pwa frontend actually WIRES it: PwaDriverMessage carries operating_company_id,
 *       and Messages.tsx's mark-read call site passes the message's own company (not just its id).
 *       A guard that only checked the backend could pass on a frontend that silently reverted to
 *       calling markDriverPwaMessageRead(msg.id) with no second argument.
 *
 * Run:  node scripts/verify-driver-pwa-message-writes-shared-company.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE_PATH = path.join(root, "apps/backend/src/drivers/messages.service.ts");
const ROUTES_PATH = path.join(root, "apps/backend/src/drivers/messages.routes.ts");
const PWA_API_PATH = path.join(root, "apps/driver-pwa/src/api/messages.ts");
const PWA_PAGE_PATH = path.join(root, "apps/driver-pwa/src/pages/Messages.tsx");
const LABEL = "verify-driver-pwa-message-writes-shared-company";

export function checkServiceHelper(serviceSrc) {
  const problems = [];
  if (!/export\s+async\s+function\s+assertDriverActingCompany/.test(serviceSrc)) {
    problems.push("messages.service.ts no longer exports assertDriverActingCompany");
    return problems;
  }
  const fnMatch = /export\s+async\s+function\s+assertDriverActingCompany[\s\S]*?\n}/.exec(serviceSrc);
  const body = fnMatch ? fnMatch[0] : "";
  if (!/d\.operating_company_id\s*=\s*\$2/.test(body)) {
    problems.push("assertDriverActingCompany no longer checks the driver's home company (d.operating_company_id = $2)");
  }
  if (!/driver_company_authorizations/.test(body) || !/is_authorized\s*=\s*true/.test(body) || !/deactivated_at\s+IS\s+NULL/.test(body)) {
    problems.push("assertDriverActingCompany no longer checks an active canonical authorization (driver_company_authorizations, is_authorized=true, deactivated_at IS NULL)");
  }
  if (!/throw new Error\(\s*["']driver_company_not_authorized["']\s*\)/.test(body)) {
    problems.push("assertDriverActingCompany no longer throws driver_company_not_authorized on failure");
  }
  return problems;
}

/** Extract one named route handler body (POST/PATCH on a given path) as a raw text slice. */
function extractRouteHandler(routesSrc, method, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`app\\.${method}\\(\\s*["\`']${escaped}["\`']`, "m");
  const m = re.exec(routesSrc);
  if (!m) return null;
  // Grab a generous window forward — enough to contain the whole handler body, not so much it
  // spills into the NEXT route registration (each handler here is well under 2000 chars).
  return routesSrc.slice(m.index, m.index + 2500);
}

export function checkRouteUsesAssert(routesSrc, method, routePath, label) {
  const problems = [];
  const handler = extractRouteHandler(routesSrc, method, routePath);
  if (!handler) {
    problems.push(`${label}: route handler not found at all (app.${method}("${routePath}", ...))`);
    return problems;
  }
  if (!/assertDriverActingCompany/.test(handler)) {
    problems.push(`${label}: handler no longer calls assertDriverActingCompany — a caller-supplied operating_company_id would be trusted outright again`);
  }
  if (!/driver_company_not_authorized/.test(handler)) {
    problems.push(`${label}: handler no longer maps driver_company_not_authorized to a 403`);
  }
  return problems;
}

export function checkFrontendWiring(pwaApiSrc, pwaPageSrc) {
  const problems = [];
  if (!/operating_company_id/.test(pwaApiSrc)) {
    problems.push("driver-pwa api/messages.ts no longer carries operating_company_id on PwaDriverMessage / the write functions");
  }
  if (!/markReadMutation\.mutate\(\s*\{[\s\S]{0,80}operating_company_id/.test(pwaPageSrc)) {
    problems.push("driver-pwa Messages.tsx's mark-read call site no longer passes the message's own operating_company_id (reverted to markReadMutation.mutate(msg.id) with no company)");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const badService = `export async function assertDriverActingCompany() { throw new Error("nope"); }`;
  const goodService = fs.readFileSync(SERVICE_PATH, "utf8");
  if (checkServiceHelper(badService).length === 0) failures.push("a gutted assertDriverActingCompany was not caught");
  if (checkServiceHelper(goodService).length !== 0) failures.push(`the real, correct service file was flagged: ${checkServiceHelper(goodService).join("; ")}`);

  const goodRoutes = fs.readFileSync(ROUTES_PATH, "utf8");
  const postProblems = checkRouteUsesAssert(goodRoutes, "post", "/api/v1/driver/messages", "POST reply");
  if (postProblems.length !== 0) failures.push(`the real POST route was flagged: ${postProblems.join("; ")}`);
  const patchProblems = checkRouteUsesAssert(goodRoutes, "patch", "/api/v1/driver/messages/:messageId/read", "PATCH read");
  if (patchProblems.length !== 0) failures.push(`the real PATCH route was flagged: ${patchProblems.join("; ")}`);

  const regressedRoutes = goodRoutes.replace(/assertDriverActingCompany/g, "IGNORED_NOOP");
  const regressedPost = checkRouteUsesAssert(regressedRoutes, "post", "/api/v1/driver/messages", "POST reply");
  if (regressedPost.length === 0) failures.push("a route with assertDriverActingCompany stripped out was not caught");

  const missingRoute = checkRouteUsesAssert(goodRoutes, "post", "/api/v1/driver/messages/does-not-exist", "fake route");
  if (missingRoute.length !== 1) failures.push("a nonexistent route path was not reported as missing");

  const goodPwaApi = fs.readFileSync(PWA_API_PATH, "utf8");
  const goodPwaPage = fs.readFileSync(PWA_PAGE_PATH, "utf8");
  if (checkFrontendWiring(goodPwaApi, goodPwaPage).length !== 0) {
    failures.push(`the real frontend files were flagged: ${checkFrontendWiring(goodPwaApi, goodPwaPage).join("; ")}`);
  }
  const regressedPage = goodPwaPage.replace(
    /markReadMutation\.mutate\(\{[^}]*\}\)/,
    "markReadMutation.mutate(msg.id)"
  );
  if (checkFrontendWiring(goodPwaApi, regressedPage).length === 0) {
    failures.push("the exact real-world regression (mark-read call site reverted to bare msg.id) was NOT caught");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — gutted service helper caught, real service/routes/frontend all clear, ` +
      `stripped-assert route regression caught, missing-route reported, real mark-read regression ` +
      `(bare msg.id) caught.`
  );
  process.exit(0);
}

const serviceSrc = fs.readFileSync(SERVICE_PATH, "utf8");
const routesSrc = fs.readFileSync(ROUTES_PATH, "utf8");
const pwaApiSrc = fs.readFileSync(PWA_API_PATH, "utf8");
const pwaPageSrc = fs.readFileSync(PWA_PAGE_PATH, "utf8");

const problems = [
  ...checkServiceHelper(serviceSrc),
  ...checkRouteUsesAssert(routesSrc, "post", "/api/v1/driver/messages", "POST reply"),
  ...checkRouteUsesAssert(routesSrc, "patch", "/api/v1/driver/messages/:messageId/read", "PATCH read"),
  ...checkFrontendWiring(pwaApiSrc, pwaPageSrc),
];

if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — driver PWA message writes (reply + mark-read) validate a caller-supplied shared/authorized company instead of always defaulting to home.`);

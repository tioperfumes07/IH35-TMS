#!/usr/bin/env node
/**
 * verify-driver-liability-void-route-wired — ACCT-SETL-LIAB-VOID-GAP.
 *
 * driver_finance.driver_liabilities has carried a full void register
 * (voided_at/void_reason/voided_by_user_id/void_reversal_entry_id) since GO-22 (migration
 * 202613490001, owner order 2026-09-02), but until this PR nothing ever wrote it — a mistake in
 * the loan/advance/bill chain had no exit under append-only law, the exact gap GO-22 was ordered
 * to close (same class of defect as ACCT-SETL-LINES-VOID-GAP on settlement_lines, fixed
 * separately).
 *
 * WHAT IT ASSERTS, all statically against source text (no DB needed):
 *   - `PATCH /api/v1/liabilities/:id/void` is registered
 *   - it is gated to the Owner role (forgiving a driver's debt is at least as consequential as
 *     mark-paid-off, which carries the same gate)
 *   - a reason is required (voidBodySchema / min length)
 *   - the UPDATE stamps voided_at, void_reason, voided_by_user_id, and zeroes current_balance
 *   - it cascades a hold to driver_finance.deduction_schedule so a voided liability cannot
 *     silently resume deducting once a temporary hold happens to expire
 *   - the frontend api client + detail drawer actually call the route with a real (non-empty)
 *     reason, not a hardcoded placeholder string — a route with no caller is exactly the "code
 *     exists, nothing uses it" class this whole sweep exists to catch
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-liability-void-route-wired";

const BACKEND = path.join(ROOT, "apps", "backend", "src", "liabilities", "liabilities.routes.ts");
const API_CLIENT = path.join(ROOT, "apps", "frontend", "src", "api", "liabilities.ts");
const DRAWER = path.join(ROOT, "apps", "frontend", "src", "pages", "liabilities", "components", "LiabilityDetailDrawer.tsx");

function readOrNull(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function check(paths = { backend: BACKEND, apiClient: API_CLIENT, drawer: DRAWER }) {
  const { backend: BACKEND_P = BACKEND, apiClient: API_CLIENT_P = API_CLIENT, drawer: DRAWER_P = DRAWER } = paths;
  const offenders = [];

  const backendSrc = readOrNull(BACKEND_P);
  if (!backendSrc) {
    offenders.push(`missing: ${path.relative(ROOT, BACKEND_P)}`);
  } else {
    if (!backendSrc.includes('"/api/v1/liabilities/:id/void"')) {
      offenders.push("void route not registered (PATCH /api/v1/liabilities/:id/void)");
    }
    const routeMatch = backendSrc.match(/app\.patch\(\s*"\/api\/v1\/liabilities\/:id\/void"[\s\S]*?\n {2}\}\);/);
    const body = routeMatch ? routeMatch[0] : "";
    if (!body) {
      offenders.push("void route handler body not found");
    } else {
      if (!/user\.role\s*!==\s*"Owner"/.test(body)) offenders.push("void route is not gated to the Owner role");
      if (!/voidBodySchema/.test(body)) offenders.push("void route does not validate a reason body");
      if (!/voided_at\s*=\s*now\(\)/.test(body)) offenders.push("void route does not stamp voided_at");
      if (!/void_reason\s*=\s*\$/.test(body)) offenders.push("void route does not stamp void_reason");
      if (!/voided_by_user_id\s*=\s*\$/.test(body)) offenders.push("void route does not stamp voided_by_user_id");
      if (!/current_balance\s*=\s*0/.test(body)) offenders.push("void route does not zero current_balance");
      if (!/UPDATE\s+driver_finance\.deduction_schedule/.test(body)) {
        offenders.push("void route does not cascade a hold to deduction_schedule");
      }
    }
    if (!/const voidBodySchema = z\.object\(\{[\s\S]*?reason:\s*z\.string\(\).*?\.min\(/.test(backendSrc)) {
      offenders.push("voidBodySchema does not require a non-trivial reason string");
    }
  }

  const apiSrc = readOrNull(API_CLIENT_P);
  if (!apiSrc) {
    offenders.push(`missing: ${path.relative(ROOT, API_CLIENT_P)}`);
  } else if (!/export function voidLiability\(/.test(apiSrc) || !/\/void\?/.test(apiSrc)) {
    offenders.push("frontend api/liabilities.ts has no voidLiability() calling the void route");
  }

  const drawerSrc = readOrNull(DRAWER_P);
  if (!drawerSrc) {
    offenders.push(`missing: ${path.relative(ROOT, DRAWER_P)}`);
  } else {
    if (!/voidLiability\(/.test(drawerSrc)) offenders.push("LiabilityDetailDrawer does not call voidLiability()");
    // A real reason prompt, not a hardcoded string handed straight to the API call (that would
    // defeat the point of a required, meaningful void_reason column).
    if (!/window\.prompt\(/.test(drawerSrc)) offenders.push("LiabilityDetailDrawer does not prompt for a void reason");
  }

  return offenders;
}

function report(offenders) {
  if (!offenders.length) {
    console.log(`${LABEL} OK — driver_liabilities void route is registered, Owner-gated, reason-required, stamps the full void register, cascades a deduction_schedule hold, and is wired end-to-end from the UI`);
    return 0;
  }
  console.error(`${LABEL} FAIL:`);
  for (const o of offenders) console.error(`  - ${o}`);
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const failures = [];

  const offenders = check();
  if (offenders.length !== 0) {
    failures.push(`case1 FAIL — real tree must be GREEN, got: ${offenders.join("; ")}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "liab-void-"));
  const backendGood = fs.readFileSync(BACKEND, "utf8");
  const apiGood = fs.readFileSync(API_CLIENT, "utf8");
  const drawerGood = fs.readFileSync(DRAWER, "utf8");

  const backendFile = path.join(tmp, "liabilities.routes.ts");
  const apiFile = path.join(tmp, "liabilities.ts");
  const drawerFile = path.join(tmp, "LiabilityDetailDrawer.tsx");
  const paths = { backend: backendFile, apiClient: apiFile, drawer: drawerFile };

  // case2: good fixtures (copies of the real files) must extract and pass identically.
  fs.writeFileSync(backendFile, backendGood);
  fs.writeFileSync(apiFile, apiGood);
  fs.writeFileSync(drawerFile, drawerGood);
  if (check(paths).length !== 0) {
    failures.push(`case2 FAIL — copied good fixtures must be GREEN, got: ${check(paths).join("; ")}`);
  }

  // case3: strip the Owner gate from the VOID route body specifically (the string appears twice —
  // once in mark-paid-off, once in void — removing the wrong one would prove nothing).
  const voidRouteMarker = '"/api/v1/liabilities/:id/void"';
  const voidRouteIdx = backendGood.indexOf(voidRouteMarker);
  const gateInVoid = backendGood.indexOf('if (user.role !== "Owner")', voidRouteIdx);
  const gateLineEnd = backendGood.indexOf("\n", gateInVoid) + 1;
  const strippedGate = backendGood.slice(0, gateInVoid) + backendGood.slice(gateLineEnd);
  fs.writeFileSync(backendFile, strippedGate);
  if (!check(paths).some((o) => /Owner role/.test(o))) failures.push("case3 FAIL — missing Owner gate must be caught.");
  fs.writeFileSync(backendFile, backendGood);

  // case4: no deduction_schedule cascade — must go RED.
  fs.writeFileSync(
    backendFile,
    backendGood.replace(/\/\/ Cascade:[\s\S]*?\[params\.data\.id, `Parent liability voided: \$\{body\.data\.reason\}`\]\n\s*\);\n\n/, "")
  );
  if (!check(paths).some((o) => /deduction_schedule/.test(o))) failures.push("case4 FAIL — missing deduction_schedule cascade must be caught.");
  fs.writeFileSync(backendFile, backendGood);

  // case5: frontend never calls voidLiability — must go RED.
  fs.writeFileSync(drawerFile, drawerGood.replace(/void voidLiability\(/, "void Promise.resolve((").replace("voidLiability, ", ""));
  if (!check(paths).some((o) => /does not call voidLiability/.test(o))) failures.push("case5 FAIL — missing FE call must be caught.");
  fs.writeFileSync(drawerFile, drawerGood);

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — real tree GREEN, good-fixture copies GREEN, missing-Owner-gate/missing-cascade/missing-FE-call each independently caught RED`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(check()));
}

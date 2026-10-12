#!/usr/bin/env node
/**
 * verify-driver-liability-void-route-wired — ACCT-SETL-LIAB-VOID-GAP + AJK-12 / LEAD 443.114.
 *
 * driver_finance.driver_liabilities has carried a full void register
 * (voided_at/void_reason/voided_by_user_id/void_reversal_entry_id) since GO-22 (migration
 * 202613490001, owner order 2026-09-02). The void route calls the ONE engine
 * voidDriverLiabilityInClientTx (shared with fine dismissal); the engine stamps the register,
 * writes off through the reversing entry, and cascades a hold to deduction_schedule.
 *
 * WHAT IT ASSERTS, all statically against source text (no DB needed):
 *   - `PATCH /api/v1/liabilities/:id/void` is registered
 *   - it is gated to the Owner role
 *   - a reason is required (voidBodySchema / min length)
 *   - the route calls voidDriverLiabilityInClientTx (ONE engine — never re-implements stamps)
 *   - the engine stamps voided_at, void_reason, voided_by_user_id, zeroes current_balance
 *   - the engine cascades a hold to driver_finance.deduction_schedule
 *   - the frontend api client + detail drawer call the route with a real (non-empty) reason
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-liability-void-route-wired";

const BACKEND = path.join(ROOT, "apps", "backend", "src", "liabilities", "liabilities.routes.ts");
const VOID_ENGINE = path.join(ROOT, "apps", "backend", "src", "liabilities", "driver-liability-void.service.ts");
const API_CLIENT = path.join(ROOT, "apps", "frontend", "src", "api", "liabilities.ts");
const DRAWER = path.join(ROOT, "apps", "frontend", "src", "pages", "liabilities", "components", "LiabilityDetailDrawer.tsx");

function readOrNull(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function check(paths = { backend: BACKEND, voidEngine: VOID_ENGINE, apiClient: API_CLIENT, drawer: DRAWER }) {
  const {
    backend: BACKEND_P = BACKEND,
    voidEngine: VOID_ENGINE_P = VOID_ENGINE,
    apiClient: API_CLIENT_P = API_CLIENT,
    drawer: DRAWER_P = DRAWER,
  } = paths;
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
      // AJK-12: route must call the ONE engine — stamps live in the engine, not inline in the route.
      if (!/voidDriverLiabilityInClientTx\(/.test(body)) {
        offenders.push("void route does not call the ONE void engine (voidDriverLiabilityInClientTx)");
      }
    }
    if (!/const voidBodySchema = z\.object\(\{[\s\S]*?reason:\s*z\.string\(\).*?\.min\(/.test(backendSrc)) {
      offenders.push("voidBodySchema does not require a non-trivial reason string");
    }
  }

  const engineSrc = readOrNull(VOID_ENGINE_P);
  if (!engineSrc) {
    offenders.push(`missing: ${path.relative(ROOT, VOID_ENGINE_P)}`);
  } else {
    if (!/export async function voidDriverLiabilityInClientTx\(/.test(engineSrc)) {
      offenders.push("void engine does not export voidDriverLiabilityInClientTx");
    }
    if (!/voided_at\s*=\s*now\(\)/.test(engineSrc)) offenders.push("void engine does not stamp voided_at");
    if (!/void_reason\s*=\s*\$/.test(engineSrc)) offenders.push("void engine does not stamp void_reason");
    if (!/voided_by_user_id\s*=\s*\$/.test(engineSrc)) offenders.push("void engine does not stamp voided_by_user_id");
    if (!/current_balance\s*=\s*0/.test(engineSrc)) offenders.push("void engine does not zero current_balance");
    if (!/UPDATE\s+driver_finance\.deduction_schedule/.test(engineSrc)) {
      offenders.push("void engine does not cascade a hold to deduction_schedule");
    }
    if (!/writeOffDriverReceivableInClientTx\(/.test(engineSrc)) {
      offenders.push("void engine does not write off through the reversing entry");
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
    if (!/VoidReasonModal/.test(drawerSrc) || !/reason\.trim\(\)/.test(drawerSrc)) {
      offenders.push("LiabilityDetailDrawer does not prompt for a void reason via VoidReasonModal with a trimmed reason");
    }
  }

  return offenders;
}

function report(offenders) {
  if (!offenders.length) {
    console.log(`${LABEL} OK — driver_liabilities void route is Owner-gated, reason-required, calls the ONE void engine (stamps + write-off + deduction_schedule hold), and is wired end-to-end from the UI`);
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
  const engineGood = fs.readFileSync(VOID_ENGINE, "utf8");
  const apiGood = fs.readFileSync(API_CLIENT, "utf8");
  const drawerGood = fs.readFileSync(DRAWER, "utf8");

  const backendFile = path.join(tmp, "liabilities.routes.ts");
  const engineFile = path.join(tmp, "driver-liability-void.service.ts");
  const apiFile = path.join(tmp, "liabilities.ts");
  const drawerFile = path.join(tmp, "LiabilityDetailDrawer.tsx");
  const paths = { backend: backendFile, voidEngine: engineFile, apiClient: apiFile, drawer: drawerFile };

  fs.writeFileSync(backendFile, backendGood);
  fs.writeFileSync(engineFile, engineGood);
  fs.writeFileSync(apiFile, apiGood);
  fs.writeFileSync(drawerFile, drawerGood);
  if (check(paths).length !== 0) {
    failures.push(`case2 FAIL — copied good fixtures must be GREEN, got: ${check(paths).join("; ")}`);
  }

  // case3: strip the Owner gate from the VOID route body
  const voidRouteMarker = '"/api/v1/liabilities/:id/void"';
  const voidRouteIdx = backendGood.indexOf(voidRouteMarker);
  const gateInVoid = backendGood.indexOf('if (user.role !== "Owner")', voidRouteIdx);
  const gateLineEnd = backendGood.indexOf("\n", gateInVoid) + 1;
  const strippedGate = backendGood.slice(0, gateInVoid) + backendGood.slice(gateLineEnd);
  fs.writeFileSync(backendFile, strippedGate);
  if (!check(paths).some((o) => /Owner role/.test(o))) failures.push("case3 FAIL — missing Owner gate must be caught.");
  fs.writeFileSync(backendFile, backendGood);

  // case4: engine loses deduction_schedule cascade — must go RED.
  fs.writeFileSync(engineFile, engineGood.replace(/UPDATE\s+driver_finance\.deduction_schedule/, "UPDATE driver_finance.nope_schedule"));
  if (!check(paths).some((o) => /deduction_schedule/.test(o))) failures.push("case4 FAIL — missing deduction_schedule cascade must be caught.");
  fs.writeFileSync(engineFile, engineGood);

  // case5: frontend never calls voidLiability — must go RED.
  fs.writeFileSync(
    drawerFile,
    drawerGood
      .replace(/await voidLiability\(/, "await Promise.resolve((")
      .replace(/import \{ holdLiability, markLiabilityPaidOff, resumeLiability, voidLiability \}/, "import { holdLiability, markLiabilityPaidOff, resumeLiability }")
      .replace("voidLiability, ", ""),
  );
  if (!check(paths).some((o) => /does not call voidLiability/.test(o))) failures.push("case5 FAIL — missing FE call must be caught.");
  fs.writeFileSync(drawerFile, drawerGood);

  // case6: route skips the ONE engine — must go RED.
  fs.writeFileSync(backendFile, backendGood.replace(/voidDriverLiabilityInClientTx\(/g, "noopVoid("));
  if (!check(paths).some((o) => /ONE void engine/.test(o))) failures.push("case6 FAIL — route skipping the ONE engine must be caught.");
  fs.writeFileSync(backendFile, backendGood);

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — real tree GREEN, good-fixture copies GREEN, missing-Owner-gate/missing-cascade/missing-FE-call/skipped-engine each independently caught RED`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(check()));
}

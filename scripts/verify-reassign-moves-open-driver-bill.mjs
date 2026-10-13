#!/usr/bin/env node
/**
 * LEAD 443.113 AJK-01 — a reassignment moves the load's OPEN driver bill to the new driver; a bill that is no longer open
 * is refused by name. Locks createDriverBillArtifacts (apps/backend/src/dispatch/book-load.service.ts), the one driver-bill
 * engine every assignment path calls through ensureDriverBillArtifactsForLoad:
 *   R1  the existing-bill SELECT reads driver_id and team_driver_id (it used to read only money and status)
 *   R2  the same-total early return is taken only when the driver identity did NOT change
 *   R3  a non-recalculable bill whose driver would change throws DriverBillReassignRefusedError (never already_exists)
 *   R4  the quick-save routes map that refusal to a named 409
 * Behaviour is proven on real Postgres by apps/backend/src/dispatch/__tests__/reassign-moves-open-driver-bill.db.test.ts.
 *   node scripts/verify-reassign-moves-open-driver-bill.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const ENGINE = "apps/backend/src/dispatch/book-load.service.ts";
const ROUTES = "apps/backend/src/dispatch/assignments/quicksave.routes.ts";

/** Returns the list of violations for the given engine + routes source. */
export function check(engineSrc, routesSrc) {
  const out = [];
  const start = engineSrc.indexOf("export async function createDriverBillArtifacts(");
  if (start < 0) return ["createDriverBillArtifacts not found in the engine"];
  const next = engineSrc.indexOf("\nexport ", start + 10);
  const body = engineSrc.slice(start, next < 0 ? undefined : next);

  const sel = body.match(/SELECT[^`]*?FROM\s+driver_finance\.driver_bills[^`]*?load_id\s*=\s*\$2::uuid[^`]*`/);
  if (!sel) out.push("R1: the existing-bill SELECT (driver_finance.driver_bills by load_id) was not found");
  else if (!/\bdriver_id\b/.test(sel[0].replace(/team_driver_id/g, "")) || !/\bteam_driver_id\b/.test(sel[0])) {
    out.push("R1: the existing-bill SELECT does not read driver_id and team_driver_id — a reassignment cannot see who owns the bill");
  }

  if (!/const\s+identityChanged\s*=/.test(body)) out.push("R2: no identityChanged comparison in createDriverBillArtifacts");
  for (const m of body.matchAll(/if\s*\(([^)]*totalBillCents\s*===\s*existingGross[^)]*)\)/g)) {
    if (!/!\s*identityChanged/.test(m[1])) {
      out.push(`R2: the same-total early return "if (${m[1].trim()})" does not require an unchanged driver — A keeps the bill for B's load`);
    }
  }

  const nr = body.match(/if\s*\(\s*!isRecalculable\s*\)\s*\{([\s\S]*?)\n    \}/);
  if (!nr || !/identityChanged[\s\S]*throw\s+new\s+DriverBillReassignRefusedError/.test(nr[1])) {
    out.push("R3: a non-open / settled bill whose driver would change is not refused by name (DriverBillReassignRefusedError)");
  }

  if (!/error\s+instanceof\s+DriverBillReassignRefusedError[\s\S]{0,80}status:\s*409/.test(routesSrc)) {
    out.push("R4: quicksave.routes.ts does not map DriverBillReassignRefusedError to 409");
  }
  return out;
}

function selftest() {
  const engine = readFileSync(ENGINE, "utf8");
  const routes = readFileSync(ROUTES, "utf8");
  const clean = check(engine, routes);
  if (clean.length) {
    console.error("SELFTEST FAIL: the real source does not pass:\n  " + clean.join("\n  "));
    process.exit(1);
  }
  const plants = [
    ["R1 SELECT drops driver identity", engine.replace(/,\s*\n\s*driver_id::text, team_driver_id::text/, ""), routes, "R1"],
    ["R2 the AJK-01 defect (equal total returns before the driver is compared)", engine.replace(/totalBillCents === existingGross && !identityChanged/, "totalBillCents === existingGross"), routes, "R2"],
    ["R3 settled bill silently keeps the old driver", engine.replace(/throw new DriverBillReassignRefusedError\(/, "void ("), routes, "R3"],
    ["R4 refusal unmapped", engine, routes.replace(/error instanceof DriverBillReassignRefusedError/, "false"), "R4"],
  ];
  let missed = 0;
  for (const [label, e, r, rule] of plants) {
    if (e === engine && r === routes) {
      console.error(`SELFTEST FAIL: plant "${label}" did not change the source — the plant is stale`);
      missed++;
      continue;
    }
    const v = check(e, r);
    if (!v.some((x) => x.startsWith(rule + ":"))) {
      console.error(`SELFTEST FAIL: plant "${label}" was NOT caught`);
      missed++;
    } else console.log(`selftest: caught "${label}"`);
  }
  if (missed) process.exit(1);
  console.log(`SELFTEST OK: ${plants.length} plants caught, real source clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const v = check(readFileSync(ENGINE, "utf8"), readFileSync(ROUTES, "utf8"));
  if (v.length) {
    console.error("verify-reassign-moves-open-driver-bill: FAIL\n  " + v.join("\n  "));
    process.exit(1);
  }
  console.log("verify-reassign-moves-open-driver-bill: OK — reassignment compares the driver, moves the open bill, refuses a closed one by name");
}

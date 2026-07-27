#!/usr/bin/env node
/**
 * SET-05 — pay-run close must re-assert the net-pay floor AFTER escrow + advance +
 * chargeback subtraction. Deduction-apply floors at apply-time only; close can still
 * breach 5% when later withholdings run. This guard fails closed if:
 *   - closeSettlementPayRun lacks NET_PAY_FLOOR_BREACH / resolveSettlementMinNet, OR
 *   - the floor check is not ordered after netCents is computed from escrow/advance/chargeback
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-netpay-floor-at-close";
const SELFTEST = process.argv.includes("--selftest");
const SVC = path.join(ROOT, "apps/backend/src/driver-finance/settlement-payrun-close.service.ts");
const ROUTES = path.join(ROOT, "apps/backend/src/driver-finance/settlement-payrun-close.routes.ts");

function assert(cond, msg, problems) {
  if (!cond) problems.push(msg);
}

function checkSources(svcSrc, routesSrc) {
  const problems = [];
  assert(
    /resolveSettlementMinNet/.test(svcSrc),
    "settlement-payrun-close.service.ts must call resolveSettlementMinNet (reuse deduction-cap floor)",
    problems
  );
  assert(
    /"NET_PAY_FLOOR_BREACH"/.test(svcSrc) || /SettlementPayRunError\(\s*"NET_PAY_FLOOR_BREACH"/.test(svcSrc),
    "settlement-payrun-close.service.ts must throw NET_PAY_FLOOR_BREACH when post-withholding net < floor",
    problems
  );
  assert(
    /overrideFloor/.test(svcSrc),
    "settlement-payrun-close.service.ts must accept overrideFloor (actor reason) — never silent cap",
    problems
  );

  // Ordering: netCents assignment that includes escrow/advance/chargeback must appear BEFORE the throw.
  const netIdx = svcSrc.search(
    /const netCents\s*=\s*[\s\S]*?escrowContributionCents[\s\S]*?advanceRecoveriesCents[\s\S]*?chargebacksCents/
  );
  const throwIdx = svcSrc.search(/SettlementPayRunError\(\s*\n?\s*"NET_PAY_FLOOR_BREACH"/);
  assert(netIdx >= 0, "netCents must subtract escrow + advance + chargebacks", problems);
  assert(throwIdx >= 0, "NET_PAY_FLOOR_BREACH throw missing", problems);
  assert(
    netIdx >= 0 && throwIdx > netIdx,
    "NET_PAY_FLOOR_BREACH must be asserted AFTER post-withholding netCents is computed",
    problems
  );

  assert(
    /override_floor/.test(routesSrc) && /overrideFloor/.test(routesSrc),
    "settlement-payrun-close.routes.ts must accept override_floor and pass overrideFloor to closeSettlementPayRun",
    problems
  );
  return problems;
}

function selftest() {
  const goodSvc = `
    const netCents = grossCents - deductionsCents - escrowContributionCents - advanceRecoveriesCents - chargebacksCents;
    const resolvedMinNet = await resolveSettlementMinNet(client, settlement.driver_id, opco);
    if (netCents < floorCents) {
      throw new SettlementPayRunError(
        "NET_PAY_FLOOR_BREACH",
        "x"
      );
    }
    overrideFloor
  `;
  const goodRoutes = `override_floor: z.object({}).optional();\noverrideFloor: b.data.override_floor`;
  const badSvc = `
    const netCents = grossCents - deductionsCents;
    if (netCents < 0) throw new SettlementPayRunError("NET_PAY_NEGATIVE", "x");
  `;
  const badOrder = `
    if (true) throw new SettlementPayRunError("NET_PAY_FLOOR_BREACH", "x");
    const netCents = grossCents - deductionsCents - escrowContributionCents - advanceRecoveriesCents - chargebacksCents;
    resolveSettlementMinNet; overrideFloor
  `;
  const g = checkSources(goodSvc, goodRoutes);
  if (g.length) throw new Error(`${LABEL} selftest: compliant fixture flagged: ${g.join("; ")}`);
  const b1 = checkSources(badSvc, goodRoutes);
  if (!b1.length) throw new Error(`${LABEL} selftest: missing-floor defect NOT caught`);
  const b2 = checkSources(badOrder, goodRoutes);
  if (!b2.some((m) => /AFTER/.test(m))) throw new Error(`${LABEL} selftest: order defect NOT caught`);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
}

const svc = fs.readFileSync(SVC, "utf8");
const routes = fs.readFileSync(ROUTES, "utf8");
const problems = checkSources(svc, routes);
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `[${LABEL}] OK — pay-run close re-asserts resolveSettlementMinNet floor after escrow/advance/chargeback; NET_PAY_FLOOR_BREACH + override_floor wired`
);

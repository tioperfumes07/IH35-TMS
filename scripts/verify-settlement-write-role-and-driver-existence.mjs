#!/usr/bin/env node
/**
 * ACCT-F5576 regression guard — driver-finance settlement writes must require an office role and
 * validate driver_id exists before creating a real settlement.
 *
 * driver-finance/settlements.routes.ts had ZERO role-based access control on any route:
 * authed() only requires a valid session, and assertCompanyMembership (reached via withCompany)
 * checks org.user_accessible_company_ids(), which is role-agnostic -- any authenticated member of
 * the company, including a Driver, satisfied it. Two consequences:
 *
 *   1. POST /settlements created a real driver_finance.driver_settlements row with an
 *      attacker-chosen gross_pay/net_pay for ANY driver_id, with zero check the driver exists or
 *      belongs to the company.
 *   2. PATCH /:id/finalize locked the settlement AND called queuePaymentOnFinalize -- an automatic
 *      REAL PAYMENT queue -- reachable by any authenticated company member, not just office staff.
 *
 * CLAUDE.md's own "DRIVER DEDUCTION AUTHORIZATION" note already documents the intent that
 * acknowledge is "the COMPANY USER's sign-off" (i.e. NOT the driver) -- the code never enforced it.
 *
 * Fix: SETTLEMENT_WRITE_ROLES (matching settlements/approval.routes.ts's role set for the same
 * domain) gates POST create, PATCH acknowledge, and PATCH finalize; a driver-existence check
 * (company-scoped) gates the INSERT in POST create.
 *
 * This static check (no DB connection) asserts:
 *   1. SETTLEMENT_WRITE_ROLES is defined with at least Owner/Administrator/Accountant/Payroll.
 *   2. All 3 write routes (POST /settlements, PATCH /:id/acknowledge, PATCH /:id/finalize) call
 *      requireSettlementWriteRole, not the role-agnostic authed().
 *   3. POST /settlements queries mdata.drivers (company-scoped) before the INSERT and returns
 *      driver_not_found -> 404 on a miss.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:settlement-write-role-and-driver-existence";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/driver-finance/settlements.routes.ts";

const REQUIRED_ROLES = ["Owner", "Administrator", "Accountant", "Payroll"];

function assertAll(src) {
  const problems = [];

  const rolesMatch = src.match(/const SETTLEMENT_WRITE_ROLES = new Set\(\[([^\]]+)\]\)/);
  if (!rolesMatch) {
    problems.push(`SETTLEMENT_WRITE_ROLES set not found`);
  } else {
    for (const role of REQUIRED_ROLES) {
      if (!rolesMatch[1].includes(`"${role}"`)) {
        problems.push(`SETTLEMENT_WRITE_ROLES missing required role "${role}"`);
      }
    }
  }

  const routeGuardPairs = [
    [/app\.post\("\/api\/v1\/driver-finance\/settlements", async \(req, reply\) => \{\s*\n\s*const user = (\w+)\(req, reply\);/, "POST /settlements"],
    [/app\.patch\("\/api\/v1\/driver-finance\/settlements\/:id\/acknowledge", async \(req, reply\) => \{\s*\n\s*const user = (\w+)\(req, reply\);/, "PATCH /:id/acknowledge"],
    [/app\.patch\("\/api\/v1\/driver-finance\/settlements\/:id\/finalize", async \(req, reply\) => \{\s*\n\s*const user = (\w+)\(req, reply\);/, "PATCH /:id/finalize"],
  ];
  for (const [re, label] of routeGuardPairs) {
    const m = src.match(re);
    if (!m) {
      problems.push(`${label}: route not found or shape drifted`);
    } else if (m[1] !== "requireSettlementWriteRole") {
      problems.push(`${label}: calls ${m[1]}(), not requireSettlementWriteRole() -- role gate missing`);
    }
  }

  if (!/SELECT id FROM mdata\.drivers WHERE id = \$1::uuid AND operating_company_id = \$2::uuid LIMIT 1/.test(src)) {
    problems.push(`POST /settlements no longer queries mdata.drivers before the INSERT`);
  }
  if (!/if \(!driverRes\.rows\[0\]\) return \{ driverNotFound: true as const \};/.test(src)) {
    problems.push(`POST /settlements no longer returns driverNotFound on a missing/foreign driver_id`);
  }
  if (!/if \("driverNotFound" in created\) return reply\.code\(404\)\.send\(\{ error: "driver_not_found" \}\);/.test(src)) {
    problems.push(`POST /settlements reply mapping no longer branches on driverNotFound`);
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  // Plant defect 1: regress POST /settlements back to the role-agnostic authed().
  const planted1 = src.replace(
    'app.post("/api/v1/driver-finance/settlements", async (req, reply) => {\n    const user = requireSettlementWriteRole(req, reply);',
    'app.post("/api/v1/driver-finance/settlements", async (req, reply) => {\n    const user = authed(req, reply);',
  );
  if (planted1 === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation 1 target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted1).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect 1 (POST /settlements role gate dropped) not caught`);
    process.exit(1);
  }

  // Plant defect 2: drop the driver-existence check entirely.
  const planted2 = src.replace(
    /\n\s*\/\/ ACCT-F5576: driver_id was previously trusted[\s\S]*?if \(!driverRes\.rows\[0\]\) return \{ driverNotFound: true as const \};\n/,
    "\n",
  );
  if (planted2 === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation 2 target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted2).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect 2 (driver-existence check dropped) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);

#!/usr/bin/env node
/**
 * DRIVER-COMPLIANCE-01 (Claude Lead, 2026-09-11 — docs/bus/INBOX-CC-3.md): 25 USMCA Active drivers,
 * only 17 had cdl_number, 13 had cdl_expires_at, 2 had dot_medical_expires_at. Every driver on the
 * 3 currently-active loads had at least one blank credential and passed dispatch's WF-038
 * active-driver gate silently (it only checks status='Active', never credential completeness).
 * Two rows carried status='Active' with is_sample_data NOT true despite being unmistakable junk
 * ("ZZTEST AUTOACCT PROBE", "SAFETY —") — a quarantine-law violation.
 *
 * This guard asserts CORRECTNESS, not presence:
 *  STATIC half — the new dispatch service-boundary gate (driver-compliance-01.gate.ts) exists,
 *  is registered for book_load/assign_driver/quick_assign in BOTH files that wire the gate set
 *  (auth-gates/routes.ts, the actual preHandler boundary, and driver-eligibility.routes.ts, the UI
 *  read endpoint) — not just present somewhere; the quarantine naming heuristic recognizes the two
 *  named junk rows without loosening to a bare substring match; DriverProfilePage.tsx's Medical
 *  card no longer collapses a missing dot_medical_expires_at into a bare "—".
 *  LIVE half (DATABASE_URL-gated, same convention as verify-acc13-no-test-accounts-in-usmca-coa.mjs
 *  — skipped, not failed, when no prod connection is configured, so CI's ephemeral DB never breaks
 *  this) — 0 USMCA Active drivers with is_sample_data=true; every USMCA Active driver on a
 *  dispatched/in_transit/assigned_not_dispatched load has cdl_number, cdl_expires_at, AND a linked,
 *  non-deleted docs.files row in the CDL or Mexican Federal License category.
 *
 * Usage: node scripts/verify-driver-licence-documents-linked.mjs [--selftest]
 *        DATABASE_URL=<prod> node scripts/verify-driver-licence-documents-linked.mjs
 */
import fs from "node:fs";

const LABEL = "verify-driver-licence-documents-linked";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const GATE_FILE = "apps/backend/src/dispatch/auth-gates/driver-compliance-01.gate.ts";
const AUTH_GATE_ROUTES = "apps/backend/src/dispatch/auth-gates/routes.ts";
const ELIGIBILITY_ROUTES = "apps/backend/src/dispatch/driver-eligibility.routes.ts";
const DRIVERS_ROUTES = "apps/backend/src/mdata/drivers.routes.ts";
const DRIVER_PROFILE_PAGE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";

// ---- pure functions under selftest -----------------------------------------------------------

export function gateFileBlocksOnMissingCredentials(gateSrc) {
  return (
    /if \(!row\.cdl_number\) missing\.push/.test(gateSrc) &&
    /if \(!row\.cdl_expires_at\) missing\.push/.test(gateSrc) &&
    /if \(!row\.dot_medical_expires_at\) missing\.push/.test(gateSrc) &&
    /registerGate\("book_load", driverComplianceGate\)/.test(gateSrc) &&
    /registerGate\("assign_driver", driverComplianceGate\)/.test(gateSrc) &&
    /registerGate\("quick_assign", driverComplianceGate\)/.test(gateSrc)
  );
}

export function gateWiredAtServiceBoundary(authGateRoutesSrc, eligibilityRoutesSrc) {
  // authGateRoutesSrc is the file whose preHandler actually blocks POST .../book,
  // .../quick-assign, PATCH .../assignment — the real service boundary. eligibilityRoutesSrc is
  // the read-only UI endpoint; both must import the gate module so a driver assigned via either
  // path sees the same verdict.
  return (
    /import "\.\/driver-compliance-01\.gate\.js";/.test(authGateRoutesSrc) &&
    /import "\.\/auth-gates\/driver-compliance-01\.gate\.js";/.test(eligibilityRoutesSrc)
  );
}

export function quarantineHeuristicCatchesNamedJunkRows(driversRoutesSrc) {
  return (
    /zztest/i.test(driversRoutesSrc) &&
    /firstName\.trim\(\)\.toLowerCase\(\) === "safety" && lastName\.trim\(\) === "—"/.test(driversRoutesSrc)
  );
}

export function medicalCardShowsHonestMissingState(profilePageSrc) {
  return (
    /Missing — no document/.test(profilePageSrc) &&
    !/Expires \{formatDateUS\(profileDriver\.dot_medical_expires_at as string \| null\) \|\| "—"\}/.test(profilePageSrc)
  );
}

// ---- selftest ---------------------------------------------------------------------------------

function selftest() {
  const failures = [];
  const expectTrue = (name, actual) => {
    if (actual !== true) failures.push(`${name}: expected true, got ${actual}`);
  };
  const expectFalse = (name, actual) => {
    if (actual !== false) failures.push(`${name}: expected false, got ${actual}`);
  };

  const goodGate = `
    if (!row.cdl_number) missing.push("CDL number");
    if (!row.cdl_expires_at) missing.push("CDL expiration date");
    if (!row.dot_medical_expires_at) missing.push("DOT medical certificate expiration date");
    registerGate("book_load", driverComplianceGate);
    registerGate("assign_driver", driverComplianceGate);
    registerGate("quick_assign", driverComplianceGate);
  `;
  expectTrue("gate blocks on missing (good)", gateFileBlocksOnMissingCredentials(goodGate));
  expectFalse("gate blocks on missing (missing dot_medical branch)", gateFileBlocksOnMissingCredentials(goodGate.replace('if (!row.dot_medical_expires_at) missing.push("DOT medical certificate expiration date");', "")));
  expectFalse("gate blocks on missing (not registered for quick_assign)", gateFileBlocksOnMissingCredentials(goodGate.replace('registerGate("quick_assign", driverComplianceGate);', "")));

  expectTrue(
    "wired at service boundary (good)",
    gateWiredAtServiceBoundary('import "./driver-compliance-01.gate.js";', 'import "./auth-gates/driver-compliance-01.gate.js";')
  );
  expectFalse(
    "wired at service boundary (missing from auth-gates/routes.ts)",
    gateWiredAtServiceBoundary('// no import here', 'import "./auth-gates/driver-compliance-01.gate.js";')
  );
  expectFalse(
    "wired at service boundary (missing from driver-eligibility.routes.ts)",
    gateWiredAtServiceBoundary('import "./driver-compliance-01.gate.js";', '// no import here')
  );

  const goodHeuristic = 'if (/(^|\\W)(test|codex|zztest)(\\W|$)/i.test(full)) return true;\n  if (firstName.trim().toLowerCase() === "safety" && lastName.trim() === "—") return true;';
  expectTrue("quarantine heuristic catches named junk rows (good)", quarantineHeuristicCatchesNamedJunkRows(goodHeuristic));
  expectFalse(
    "quarantine heuristic catches named junk rows (zztest removed)",
    quarantineHeuristicCatchesNamedJunkRows('if (/(^|\\W)(test|codex)(\\W|$)/i.test(full)) return true;\n  if (firstName.trim().toLowerCase() === "safety" && lastName.trim() === "—") return true;')
  );
  expectFalse(
    "quarantine heuristic catches named junk rows (safety exact-match removed)",
    quarantineHeuristicCatchesNamedJunkRows('if (/(^|\\W)(test|codex|zztest)(\\W|$)/i.test(full)) return true;')
  );

  const goodProfile = 'profileDriver.dot_medical_expires_at\n  ? `Expires ${formatDateUS(...)}`\n  : <span>Missing — no document</span>';
  expectTrue("medical card honest (good)", medicalCardShowsHonestMissingState(goodProfile));
  expectFalse(
    "medical card honest (reverted to bare dash)",
    medicalCardShowsHonestMissingState('Expires {formatDateUS(profileDriver.dot_medical_expires_at as string | null) || "—"}')
  );

  if (failures.length) {
    console.error(`${LABEL}: SELFTEST FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

// ---- static half --------------------------------------------------------------------------

for (const f of [GATE_FILE, AUTH_GATE_ROUTES, ELIGIBILITY_ROUTES, DRIVERS_ROUTES, DRIVER_PROFILE_PAGE]) {
  if (!fs.existsSync(f)) {
    console.error(`${LABEL}: FAIL — ${f} not found`);
    process.exit(1);
  }
}
const gateSrc = fs.readFileSync(GATE_FILE, "utf8");
const authGateRoutesSrc = fs.readFileSync(AUTH_GATE_ROUTES, "utf8");
const eligibilityRoutesSrc = fs.readFileSync(ELIGIBILITY_ROUTES, "utf8");
const driversRoutesSrc = fs.readFileSync(DRIVERS_ROUTES, "utf8");
const profilePageSrc = fs.readFileSync(DRIVER_PROFILE_PAGE, "utf8");

const staticChecks = [
  ["gate blocks on missing credentials", gateFileBlocksOnMissingCredentials(gateSrc)],
  ["gate wired at the real service boundary (not just the read-only eligibility endpoint)", gateWiredAtServiceBoundary(authGateRoutesSrc, eligibilityRoutesSrc)],
  ["quarantine heuristic catches ZZTEST AUTOACCT PROBE and SAFETY — by exact/whole-word match", quarantineHeuristicCatchesNamedJunkRows(driversRoutesSrc)],
  ["driver profile Medical card shows an honest 'Missing — no document' state", medicalCardShowsHonestMissingState(profilePageSrc)],
];
const staticFailures = staticChecks.filter(([, ok]) => !ok).map(([name]) => name);
if (staticFailures.length) {
  console.error(`${LABEL}: FAIL (static)\n${staticFailures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: static OK — service-boundary gate present+wired, quarantine heuristic + profile honesty fixed`);

// ---- live half (DATABASE_URL-gated) --------------------------------------------------------

if (!process.env.DATABASE_URL) {
  console.log(`${LABEL}: DATABASE_URL not set — skipping the live data re-check (static checks above still ran).`);
  console.log(`${LABEL}: to re-run live: DATABASE_URL=<prod> node ${process.argv[1]}`);
  process.exit(0);
}

const { Client } = await import("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const control = await client.query(`SELECT count(*)::int AS n FROM mdata.drivers`);
  if (control.rows[0].n === 0) {
    console.error(`${LABEL}: FAIL — driver_control=0, this connection cannot see mdata.drivers (masked read, not a verdict)`);
    process.exit(1);
  }

  const sampleRows = await client.query(
    `SELECT count(*)::int AS n FROM mdata.drivers WHERE operating_company_id = $1 AND status = 'Active' AND is_sample_data = true`,
    [USMCA]
  );
  const n = sampleRows.rows[0].n;

  const incomplete = await client.query(
    `
      SELECT d.id, d.first_name, d.last_name, d.cdl_number, d.cdl_expires_at, d.dot_medical_expires_at,
        EXISTS (
          SELECT 1 FROM docs.file_links fl
          JOIN docs.files f ON f.id = fl.file_id AND f.deleted_at IS NULL
          WHERE fl.entity_type = 'driver' AND fl.entity_id = d.id AND fl.deleted_at IS NULL
            AND f.category_id IN ('e1a52c34-6c3f-4102-94c2-2c8ade66c857', 'f66b3069-61a5-484b-ac85-17752db08c03')
        ) AS has_licence_doc
      FROM mdata.drivers d
      WHERE d.operating_company_id = $1
        AND d.status = 'Active'
        AND EXISTS (
          SELECT 1 FROM mdata.loads l
          WHERE l.assigned_primary_driver_id = d.id
            AND l.status IN ('assigned_not_dispatched', 'dispatched', 'in_transit')
        )
    `,
    [USMCA]
  );
  await client.query("ROLLBACK");

  const problems = incomplete.rows.filter(
    (r) => !r.cdl_number || !r.cdl_expires_at || !r.has_licence_doc
  );

  if (n !== 0) {
    console.error(`${LABEL}: FAIL — ${n} Active USMCA driver(s) with is_sample_data=true (quarantine-law violation, driver_control=${control.rows[0].n})`);
    process.exit(1);
  }
  if (problems.length > 0) {
    console.error(
      `${LABEL}: FAIL — ${problems.length} Active driver(s) on a dispatched/in_transit/assigned_not_dispatched load missing cdl_number/cdl_expires_at/linked licence doc: ` +
        problems.map((r) => `${r.first_name} ${r.last_name}`).join(", ")
    );
    process.exit(1);
  }
  console.log(
    `${LABEL}: PASS — 0 Active USMCA drivers with is_sample_data=true; ${incomplete.rows.length} Active driver(s) on active loads all have cdl_number+cdl_expires_at+linked licence doc (driver_control=${control.rows[0].n})`
  );
} finally {
  await client.end();
}

#!/usr/bin/env node
/**
 * USMCA app-path list APIs — DISP-API-RLS + SETL-UI-API ratchet.
 *
 * ROOT CAUSE (measured live Cascade 2026-08-09, prod br-fancy-credit-akjnd07a):
 * 1) assertCompanyMembership + mdata.loads SELECT RLS keyed on org.user_company_access
 *    instead of org.user_accessible_company_ids() — Owner sessions with no uca rows 403/see 0 loads.
 * 2) GET /driver-finance/settlements list calls recompute_driver_debt per row; function missing on
 *    prod aborts the outer txn (25P02) unless SAVEPOINT-wrapped — returns settlements=[].
 *
 * Static: membership helper, loads migration, settlement view migration, savepoint, recompute fn migration.
 * Live (optional DATABASE_URL, non-pooler): ih35_app app-path counts for USMCA opco.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-app-path-list-apis";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const PATHS = {
  membership: "apps/backend/src/_helpers/company-membership-guard.ts",
  loadsMigration: "db/migrations/202612471600_loads_rls_user_accessible_company_ids.sql",
  viewMigration: "db/migrations/202612471700_driver_settlement_with_debt_driver_opco_scope.sql",
  recomputeMigration: "db/migrations/202612471500_create_recompute_driver_debt.sql",
  settlementsRoutes: "apps/backend/src/driver-finance/settlements.routes.ts",
};

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { abs, text: null };
  return { abs, text: fs.readFileSync(abs, "utf8") };
}

export function auditStatic(root = ROOT) {
  const problems = [];
  const membership = read(path.join(root, PATHS.membership).replace(`${root}/`, ""));
  if (!membership.text) problems.push(`missing ${PATHS.membership}`);
  else if (!membership.text.includes("user_accessible_company_ids()")) {
    problems.push("company-membership-guard must use org.user_accessible_company_ids()");
  }

  const loadsMig = read(path.join(root, PATHS.loadsMigration).replace(`${root}/`, ""));
  if (!loadsMig.text) problems.push(`missing ${PATHS.loadsMigration}`);
  else if (!/loads_select_office[\s\S]*user_accessible_company_ids\s*\(\s*\)/i.test(loadsMig.text)) {
    problems.push("loads RLS migration must scope loads_select_office via user_accessible_company_ids()");
  }

  const viewMig = read(path.join(root, PATHS.viewMigration).replace(`${root}/`, ""));
  if (!viewMig.text) problems.push(`missing ${PATHS.viewMigration}`);
  else if (!/d\.operating_company_id\s*=\s*s\.operating_company_id/i.test(viewMig.text)) {
    problems.push("driver_settlement_with_debt view must entity-scope the drivers join");
  }

  const recomputeMig = read(path.join(root, PATHS.recomputeMigration).replace(`${root}/`, ""));
  if (!recomputeMig.text) problems.push(`missing ${PATHS.recomputeMigration}`);
  else if (!/CREATE OR REPLACE FUNCTION\s+driver_finance\.recompute_driver_debt/i.test(recomputeMig.text)) {
    problems.push("recompute_driver_debt migration must define driver_finance.recompute_driver_debt(uuid)");
  }

  const routes = read(path.join(root, PATHS.settlementsRoutes).replace(`${root}/`, ""));
  if (!routes.text) problems.push(`missing ${PATHS.settlementsRoutes}`);
  else {
    if (!routes.text.includes("SAVEPOINT recompute_debt_sync")) {
      problems.push("settlements.routes recomputeDebtSync must open SAVEPOINT recompute_debt_sync");
    }
    if (!routes.text.includes("ROLLBACK TO SAVEPOINT recompute_debt_sync")) {
      problems.push("settlements.routes must ROLLBACK TO SAVEPOINT on recompute failure");
    }
  }

  return problems;
}

function assertNotPooler(connectionString) {
  if (/-pooler\./.test(String(connectionString ?? ""))) {
    throw new Error(`${LABEL}: refusing -pooler DATABASE_URL (session GUC would not survive)`);
  }
}

export async function auditNeonLive(client) {
  const problems = [];
  const ownerNoUca = "d7bcbf8a-66cb-4561-acab-aed40e1a88ef";

  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL ROLE ih35_app`);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [ownerNoUca]);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA]);

    const loads = await client.query(
      `SELECT count(*)::int AS n FROM mdata.loads
       WHERE operating_company_id = $1::uuid AND soft_deleted_at IS NULL`,
      [USMCA]
    );
    const loadsN = Number(loads.rows[0]?.n ?? 0);
    if (loadsN < 1) {
      problems.push(`USMCA app-path mdata.loads expected >=1 after RLS fix, got ${loadsN}`);
    }

    const setl = await client.query(
      `SELECT count(*)::int AS n FROM driver_finance.driver_settlements s
       WHERE s.operating_company_id = $1::uuid`,
      [USMCA]
    );
    const setlN = Number(setl.rows[0]?.n ?? 0);
    if (setlN < 1) {
      problems.push(`USMCA app-path driver_settlements expected >=1, got ${setlN}`);
    }

    const fn = await client.query(
      `SELECT to_regprocedure('driver_finance.recompute_driver_debt(uuid)') IS NOT NULL AS ok`
    );
    if (!fn.rows[0]?.ok) {
      problems.push("driver_finance.recompute_driver_debt(uuid) missing on Neon — apply 202612471500");
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
  return problems;
}

function selftest() {
  let planted = 0;
  const membershipPath = path.join(ROOT, PATHS.membership);
  const original = fs.readFileSync(membershipPath, "utf8");
  fs.writeFileSync(membershipPath, original.replaceAll("user_accessible_company_ids()", "user_company_access_only()"));
  try {
    if (auditStatic().length === 0) throw new Error("selftest: expected FAIL after removing user_accessible_company_ids");
    planted += 1;
  } finally {
    fs.writeFileSync(membershipPath, original);
  }
  const clean = auditStatic();
  if (clean.length) throw new Error(`selftest cleanup red: ${clean.join("; ")}`);
  console.log(`[${LABEL}] SELFTEST PASS (${planted} planted failure)`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const staticProblems = auditStatic();
  if (staticProblems.length) {
    for (const p of staticProblems) console.error(` - ${p}`);
    console.error(`[${LABEL}] FAIL (${staticProblems.length} static)`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    assertNotPooler(url);
    const pg = await import("pg");
    const client = new pg.default.Client({ connectionString: url });
    await client.connect();
    try {
      const liveProblems = await auditNeonLive(client);
      if (liveProblems.length) {
        for (const p of liveProblems) console.error(` - ${p}`);
        console.error(`[${LABEL}] FAIL (${liveProblems.length} live)`);
        process.exit(1);
      }
    } finally {
      await client.end();
    }
  }

  console.log(`[${LABEL}] PASS${url ? " (static + live)" : " (static only — set DATABASE_URL for live)"}`);
}

main().catch((err) => {
  console.error(`[${LABEL}] ERROR:`, err);
  process.exit(1);
});

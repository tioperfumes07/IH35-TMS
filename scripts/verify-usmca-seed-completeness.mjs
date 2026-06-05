#!/usr/bin/env node
/**
 * USMCA-2 CI guard: hidden USMCA carrier has template CoA + catalog seeds when present.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  console.error(`verify:usmca-seed-completeness FAIL: ${msg}`);
  process.exit(1);
}

function readRequired(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`missing file: ${relPath}`);
  return fs.readFileSync(abs, "utf8");
}

async function main() {
  const bootstrapTs = readRequired("apps/backend/src/onboarding/usmca-carrier-bootstrap.ts");
  const routesTs = readRequired("apps/backend/src/onboarding/usmca-carrier-bootstrap.routes.ts");
  const migration386 = readRequired("db/migrations/0386_usmca_carrier_seed.sql");
  const migration387 = readRequired("db/migrations/0387_usmca_chart_of_accounts_seed.sql");
  const frontend = readRequired("apps/frontend/src/pages/admin/CarrierBootstrap.tsx");
  const manifest = readRequired("apps/frontend/src/routes/manifest.tsx");

  if (!bootstrapTs.includes("bootstrapCarrier")) fail("bootstrapCarrier export required");
  if (!routesTs.includes("/api/v1/admin/carrier-bootstrap/run")) fail("bootstrap run route required");
  if (!routesTs.includes("owner_only")) fail("bootstrap routes must enforce owner_only");
  if (!migration386.includes("code = 'USMCA'")) fail("0386 must target USMCA company");
  if (!migration387.includes("TRANSP")) fail("0387 must clone from TRANSP template");
  if (!frontend.includes("Bootstrap from TRANSP")) fail("CarrierBootstrap UI required");
  if (!manifest.includes("/admin/carrier-bootstrap")) fail("frontend route /admin/carrier-bootstrap required");

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("verify:usmca-seed-completeness PASS (static checks only; no DATABASE_DIRECT_URL)");
    return;
  }

  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("SET ROLE ih35_app");

    const companyRes = await client.query(
      `SELECT id::text, is_active, usdot_number FROM org.companies WHERE code = 'USMCA' LIMIT 1`
    );
    const usmca = companyRes.rows[0];
    if (!usmca) fail("USMCA company row missing");
    if (usmca.is_active !== false) fail("USMCA must remain hidden (is_active=false)");

    const transpCoa = await client.query(
      `SELECT count(*)::int AS c FROM accounting.qbo_accounts qa
       JOIN org.companies c ON c.id = qa.operating_company_id
       WHERE c.code = 'TRANSP'`
    );
    const usmcaCoa = await client.query(
      `SELECT count(*)::int AS c FROM accounting.qbo_accounts WHERE operating_company_id = $1::uuid`,
      [usmca.id]
    );
    const transpCount = Number(transpCoa.rows[0]?.c ?? 0);
    const usmcaCount = Number(usmcaCoa.rows[0]?.c ?? 0);

    if (transpCount > 0 && usmcaCount < Math.max(5, Math.floor(transpCount * 0.5))) {
      fail(`USMCA CoA count ${usmcaCount} below minimum vs TRANSP template ${transpCount}`);
    }

    const complaintRes = await client.query(
      `SELECT count(*)::int AS c FROM catalogs.complaint_types WHERE operating_company_id = $1::uuid`,
      [usmca.id]
    );
    const complaintCount = Number(complaintRes.rows[0]?.c ?? 0);
    if (complaintCount < 3) {
      fail(`USMCA complaint_types seed too small (${complaintCount})`);
    }

    console.log(
      `verify:usmca-seed-completeness PASS (USMCA hidden, CoA=${usmcaCount}, complaint_types=${complaintCount})`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => fail(String(err?.message || err)));

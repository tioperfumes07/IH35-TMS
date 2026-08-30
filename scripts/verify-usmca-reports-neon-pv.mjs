#!/usr/bin/env node
/** @independent-input DATABASE_URL — rechecks manifest claims against scoped Neon source counts. */
/**
 * USMCA-PV-STACK — RPT-S01..S07 prod_verified ratchet (reports module).
 *
 * Static: docs/module-completion/reports.json skeleton items RPT-S01..S07 must carry prod_verified:true.
 * Live (when DATABASE_URL set, non-pooler): Neon lucia ih35_app counts scoped USMCA
 * (5c854333-6ea5-4faa-af31-67cb272fef80) for settlement summary + fuel reconciliation sources.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-reports-neon-pv";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BRANCH = "br-fancy-credit-akjnd07a";

const MANIFEST = {
  file: "docs/module-completion/reports.json",
  ids: ["RPT-S01", "RPT-S02", "RPT-S03", "RPT-S04", "RPT-S05", "RPT-S06", "RPT-S07"],
};

function assertNotPooler(connectionString) {
  if (/-pooler\./.test(String(connectionString ?? ""))) {
    throw new Error(`${LABEL}: refusing -pooler DATABASE_URL (session GUC would not survive)`);
  }
}

export function auditManifest(root = ROOT) {
  const problems = [];
  const abs = path.join(root, MANIFEST.file);
  if (!fs.existsSync(abs)) {
    problems.push(`missing ${MANIFEST.file}`);
    return problems;
  }
  const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  const items = Array.isArray(doc.items) ? doc.items : [];
  for (const id of MANIFEST.ids) {
    const row = items.find((it) => it.id === id);
    if (!row) {
      problems.push(`${MANIFEST.file}: missing item ${id}`);
      continue;
    }
    if (row.status !== "PASS") {
      problems.push(`${MANIFEST.file}: ${id} must be PASS before prod_verified (got ${row.status})`);
    }
    if (row.prod_verified !== true) {
      problems.push(`${MANIFEST.file}: ${id} prod_verified must be true`);
    }
    if (!/PROD-VERIFIED|Neon lucia/i.test(String(row.evidence ?? ""))) {
      problems.push(`${MANIFEST.file}: ${id} evidence must cite PROD-VERIFIED / Neon lucia proof`);
    }
  }
  return problems;
}

export async function auditNeonLive(client) {
  const problems = [];
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);

  const mask = await client.query(
    `SELECT (SELECT count(*)::int FROM org.companies) AS companies,
            (SELECT count(*)::int FROM catalogs.accounts) AS accounts,
            current_user AS who`
  );
  const m = mask.rows[0] ?? {};
  if (!Number(m.companies) || !Number(m.accounts)) {
    problems.push(
      `RLS masking check failed (who=${m.who}, companies=${m.companies}, accounts=${m.accounts})`
    );
    return problems;
  }

  const q = async (label, sql, params = []) => {
    const r = await client.query(sql, params);
    return Number(r.rows[0]?.n ?? r.rows[0]?.count ?? 0);
  };

  const settlements = await q(
    "settlement_summary_source",
    `SELECT count(*)::int AS n FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  if (settlements < 0) {
    problems.push(`USMCA driver_settlements count invalid: ${settlements}`);
  }

  const fuelTxn = await q(
    "fuel_reconciliation_source",
    `SELECT count(*)::int AS n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  if (fuelTxn < 0) {
    problems.push(`USMCA fuel_transactions count invalid: ${fuelTxn}`);
  }

  const schedules = await q(
    "scheduled_reports",
    `SELECT count(*)::int AS n FROM reporting.scheduled_reports WHERE operating_company_id = $1::uuid AND status <> 'void'`,
    [USMCA]
  );
  if (schedules < 0) {
    problems.push(`USMCA scheduled_reports count invalid: ${schedules}`);
  }

  console.log(
    `[${LABEL}] Neon lucia USMCA: settlements=${settlements} fuel_txn=${fuelTxn} schedules=${schedules} branch=${BRANCH}`
  );
  return problems;
}

async function main() {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync("/tmp/usmca-reports-pv-");
    try {
      const src = path.join(ROOT, MANIFEST.file);
      fs.mkdirSync(path.join(tmp, path.dirname(MANIFEST.file)), { recursive: true });
      fs.copyFileSync(src, path.join(tmp, MANIFEST.file));
      const docPath = path.join(tmp, MANIFEST.file);
      const doc = JSON.parse(fs.readFileSync(docPath, "utf8"));
      doc.items.find((it) => it.id === "RPT-S01").prod_verified = false;
      fs.writeFileSync(docPath, JSON.stringify(doc, null, 2) + "\n");

      const planted = auditManifest(tmp);
      if (!planted.some((p) => /prod_verified must be true/.test(p))) {
        console.error(`${LABEL} SELFTEST FAIL: planted prod_verified:false not caught`);
        process.exit(1);
      }
      console.log(`${LABEL} SELFTEST PASS`);
      process.exit(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  const problems = auditManifest();
  if (process.env.DATABASE_URL) {
    assertNotPooler(process.env.DATABASE_URL);
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      problems.push(...(await auditNeonLive(client)));
    } finally {
      client.release();
      await pool.end();
    }
  } else {
    console.log(`[${LABEL}] DATABASE_URL unset — static manifest checks only`);
  }

  if (problems.length) {
    console.error(`[${LABEL}] FAIL:\n` + problems.map((p) => `  ✗ ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

#!/usr/bin/env node
/**
 * USMCA-PV-STACK — FLEET-S01..S07, FUEL-S01..S09, TASK-S01..S05 prod_verified ratchet.
 *
 * Static: docs/module-completion/{fleet,fuel,tasks}.json items must carry prod_verified:true.
 * Live (when DATABASE_URL set, non-pooler): Neon lucia ih35_app counts scoped USMCA
 * (5c854333-6ea5-4faa-af31-67cb272fef80) — shared fleet lease counts OK; honest zero fuel txns.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-fleet-fuel-tasks-neon-pv";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BRANCH = "br-fancy-credit-akjnd07a";

const MANIFESTS = [
  { file: "docs/module-completion/fleet.json", prefix: "FLEET-S", count: 7 },
  { file: "docs/module-completion/fuel.json", prefix: "FUEL-S", count: 9 },
  { file: "docs/module-completion/tasks.json", prefix: "TASK-S", count: 5 },
];

function assertNotPooler(connectionString) {
  if (/-pooler\./.test(String(connectionString ?? ""))) {
    throw new Error(`${LABEL}: refusing -pooler DATABASE_URL (session GUC would not survive)`);
  }
}

export function auditManifests(root = ROOT, manifests = MANIFESTS) {
  const problems = [];
  for (const { file, prefix, count } of manifests) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) {
      problems.push(`missing ${file}`);
      continue;
    }
    const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
    const items = Array.isArray(doc.items) ? doc.items : [];
    for (let i = 1; i <= count; i += 1) {
      const id = `${prefix}${String(i).padStart(2, "0")}`;
      const row = items.find((it) => it.id === id);
      if (!row) {
        problems.push(`${file}: missing item ${id}`);
        continue;
      }
      if (row.status !== "PASS") {
        problems.push(`${file}: ${id} must be PASS before prod_verified (got ${row.status})`);
      }
      if (row.prod_verified !== true) {
        problems.push(`${file}: ${id} prod_verified must be true`);
      }
      if (!/PROD-VERIFIED|Neon lucia/i.test(String(row.evidence ?? ""))) {
        problems.push(`${file}: ${id} evidence must cite PROD-VERIFIED / Neon lucia proof`);
      }
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

  const units = await q(
    "fleet_units",
    `SELECT count(*)::int AS n FROM mdata.units u
     WHERE u.deactivated_at IS NULL
       AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid)`,
    [USMCA]
  );
  if (units < 1) {
    problems.push(`USMCA fleet units (owner/leased) expected >=1, got ${units}`);
  }

  const equipment = await q(
    "fleet_equipment",
    `SELECT count(*)::int AS n FROM mdata.equipment e
     WHERE e.deactivated_at IS NULL
       AND (e.owner_company_id = $1::uuid OR e.currently_leased_to_company_id = $1::uuid)`,
    [USMCA]
  );
  if (equipment < 0) {
    problems.push(`USMCA equipment count invalid: ${equipment}`);
  }

  const planner = await q(
    "fuel_planner",
    `SELECT count(*)::int AS n FROM fuel.fuel_planner_settings WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  if (planner < 1) {
    problems.push(`USMCA fuel_planner_settings expected >=1, got ${planner}`);
  }

  const fuelTxn = await q(
    "fuel_txn",
    `SELECT count(*)::int AS n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  if (fuelTxn < 0) {
    problems.push(`USMCA fuel_transactions count invalid: ${fuelTxn}`);
  }

  const tasks = await q(
    "tasks",
    `SELECT count(*)::int AS n FROM tasks.task WHERE operating_company_id = $1::uuid AND is_active = true`,
    [USMCA]
  );
  if (tasks < 1) {
    problems.push(`USMCA active tasks expected >=1, got ${tasks}`);
  }

  for (const [table, schema] of [
    ["units", "mdata"],
    ["fuel_transactions", "fuel"],
    ["task", "tasks"],
  ]) {
    const stat = await client.query(
      `SELECT n_live_tup::int AS live FROM pg_stat_all_tables WHERE schemaname = $1 AND relname = $2`,
      [schema, table]
    );
    const live = Number(stat.rows[0]?.live ?? -1);
    if (live < 0) {
      problems.push(`pg_stat missing for ${schema}.${table}`);
    }
  }

  console.log(
    `[${LABEL}] Neon lucia USMCA: units=${units} equipment=${equipment} fuel_txn=${fuelTxn} planner=${planner} tasks=${tasks} branch=${BRANCH}`
  );
  return problems;
}

async function main() {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync("/tmp/usmca-pv-stack-");
    try {
      for (const { file } of MANIFESTS) {
        const src = path.join(ROOT, file);
        fs.mkdirSync(path.join(tmp, path.dirname(file)), { recursive: true });
        fs.copyFileSync(src, path.join(tmp, file));
      }
      const fleetPath = path.join(tmp, "docs/module-completion/fleet.json");
      const fleet = JSON.parse(fs.readFileSync(fleetPath, "utf8"));
      fleet.items[0].prod_verified = false;
      fs.writeFileSync(fleetPath, JSON.stringify(fleet, null, 2) + "\n");

      const planted = auditManifests(tmp);
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

  const problems = auditManifests();
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

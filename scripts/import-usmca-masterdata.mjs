#!/usr/bin/env node
// USMCA MASTERDATA IMPORT — copies the operational masterdata (driver profiles, trucks, trailers)
// into the USMCA entity so USMCA functions can be tested with the same fleet.
//
// SAFETY (this WRITES prod data — §1.5 gated):
//   • DRY-RUN by default: prints exactly what WOULD be copied, writes nothing.
//   • --apply required to write, AND you must confirm the DB is the intended target.
//   • Refuses to run unless CONFIRM_TARGET matches the connected database's inet_server_addr host,
//     so you can't accidentally hit prod when you meant a Neon test branch.
//   • Idempotent: skips any table that already has USMCA rows (re-runnable, no duplicates).
//
// MODEL (Jorge to confirm):
//   • Drivers  → fresh USMCA-scoped copies (operating_company_id = USMCA). Same people, per-carrier row.
//   • Trucks   → fresh USMCA test copies of the TRK-owned units: owner stays TRK, currently_leased_to = USMCA,
//                unit_number prefixed "U-", vin suffixed "-U" (VIN + unit# are globally UNIQUE, so test copies
//                must not collide with the real TRANSP-leased trucks).
//   • Trailers → fresh USMCA test copies (equipment_number prefixed "U-").
//   Alternative (NOT this script's default): re-lease the real TRK trucks to USMCA (takes them from TRANSP).
//
// USAGE:
//   node scripts/import-usmca-masterdata.mjs                 # dry-run against $DATABASE_URL
//   CONFIRM_TARGET=<db-host> node scripts/import-usmca-masterdata.mjs --apply   # write

import pg from "pg";

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const TRK = "b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const APPLY = process.argv.includes("--apply");
const CONN = process.env.DATABASE_URL;
if (!CONN) {
  console.error("Set DATABASE_URL (a Neon TEST branch to validate, or prod only with Jorge's explicit OK).");
  process.exit(1);
}

// Columns we OVERRIDE per table (never copied verbatim from the source row).
const OVERRIDES = {
  "mdata.drivers": {
    source_where: `operating_company_id = '${TRANSP}' AND deactivated_at IS NULL AND archived_at IS NULL`,
    set: { id: "gen_random_uuid()", operating_company_id: `'${USMCA}'`, created_at: "now()", updated_at: "now()" },
    dedupe_check: `SELECT count(*)::int AS n FROM mdata.drivers WHERE operating_company_id = '${USMCA}'`,
  },
  "mdata.units": {
    source_where: `owner_company_id = '${TRK}'`,
    set: {
      id: "gen_random_uuid()",
      owner_company_id: `'${TRK}'`,
      currently_leased_to_company_id: `'${USMCA}'`,
      unit_number: "'U-' || unit_number",
      vin: "vin || '-U'",
      assigned_driver_id: "NULL",
      created_at: "now()",
      updated_at: "now()",
    },
    dedupe_check: `SELECT count(*)::int AS n FROM mdata.units WHERE currently_leased_to_company_id = '${USMCA}'`,
  },
  "mdata.equipment": {
    source_where: `TRUE`,
    set: {
      id: "gen_random_uuid()",
      equipment_number: "'U-' || equipment_number",
      created_at: "now()",
      updated_at: "now()",
    },
    // equipment scoping column resolved at runtime (operating_company_id if present).
    dedupe_marker_prefix: "U-",
    dedupe_check: `SELECT count(*)::int AS n FROM mdata.equipment WHERE equipment_number LIKE 'U-%'`,
  },
};

async function columnsOf(client, table) {
  const [schema, name] = table.split(".");
  const res = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
       AND is_generated = 'NEVER' AND column_name <> 'tableoid'
     ORDER BY ordinal_position`,
    [schema, name]
  );
  return res.rows.map((r) => r.column_name);
}

async function main() {
  const client = new pg.Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const meta = await client.query(`SELECT current_database() AS db, inet_server_addr()::text AS host`);
  const host = meta.rows[0].host || "(unknown)";
  console.log(`Connected: db=${meta.rows[0].db} host=${host}`);

  if (APPLY && process.env.CONFIRM_TARGET !== host) {
    console.error(`REFUSING to --apply: set CONFIRM_TARGET=${host} to confirm this is the intended DB (guards against accidental prod).`);
    await client.end();
    process.exit(2);
  }

  for (const [table, cfg] of Object.entries(OVERRIDES)) {
    const cols = await columnsOf(client, table);
    // equipment: pick the entity-scope column if it exists and set it to USMCA
    if (table === "mdata.equipment") {
      for (const c of ["operating_company_id", "owner_company_id"]) if (cols.includes(c)) cfg.set[c] = `'${USMCA}'`;
    }
    const selectList = cols.map((c) => (cfg.set[c] !== undefined ? `${cfg.set[c]} AS ${c}` : c)).join(", ");
    const srcCount = (await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${cfg.source_where}`)).rows[0].n;
    const already = (await client.query(cfg.dedupe_check)).rows[0].n;

    console.log(`\n${table}: ${srcCount} source row(s) to copy → USMCA. Already present: ${already}.`);
    if (already > 0) {
      console.log(`  SKIP — USMCA already has ${already} row(s) here (idempotent).`);
      continue;
    }
    const insertSql = `INSERT INTO ${table} (${cols.join(", ")}) SELECT ${selectList} FROM ${table} WHERE ${cfg.source_where}`;
    if (!APPLY) {
      console.log(`  DRY-RUN — would INSERT ${srcCount} row(s). SQL:\n    ${insertSql.slice(0, 300)}${insertSql.length > 300 ? "…" : ""}`);
      continue;
    }
    const r = await client.query(insertSql);
    console.log(`  APPLIED — inserted ${r.rowCount} USMCA row(s).`);
  }
  await client.end();
  console.log(`\n${APPLY ? "APPLY complete." : "Dry-run complete — no writes. Re-run with --apply + CONFIRM_TARGET to write."}`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});

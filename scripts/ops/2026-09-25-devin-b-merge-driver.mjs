#!/usr/bin/env node
// ROUND 181, Step 4 — Duplicate driver merge tool.
//
// Repoints every FK to the survivor, deactivates the loser (never deletes),
// writes an appendCrudAudit row per repoint. Dry run by default.
//
// The pairs (identified by the Lead):
//   fba21d80 "ANGEL ALFONSO SOSA" vs 52037e93 "ANGEL ALFONSO SOSA PEREZ"
//   ac9ea24d "Leonel Antonio Morales Noguez" vs 5dd518ff "Leonel Antonio Morales"
//   a7983a80 "Carlos Mauricio Carvallo" vs 61727a46 "Carlos Mauricio Pena Carvallo"
//   Juan USMCA-Battery ×2
//   6edcb351 "GENARO GUERRERO CHAVEZ" vs 6e908ee1 "GENARO GUERRERO CHAVEZ"
//
// Usage:
//   node scripts/ops/2026-09-25-devin-b-merge-driver.mjs --survivor <id> --loser <id>           # dry run
//   node scripts/ops/2026-09-25-devin-b-merge-driver.mjs --survivor <id> --loser <id> --apply  # apply (requires AUTH)
//   node scripts/ops/2026-09-25-devin-b-merge-driver.mjs --evidence --driver <id>              # evidence for one driver
//   node scripts/ops/2026-09-25-devin-b-merge-driver.mjs --evidence-all                        # evidence for all known pairs

import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LABEL = "merge-driver";

// Known duplicate pairs (survivor first, loser second)
const KNOWN_PAIRS = [
  { survivor: "52037e93-484a-4659-ab60-cf2a78f4c647", loser: "fba21d80-628b-4228-ae54-336f9cbb73b6", note: "ANGEL — Lead moved advance CA-2026-0007 to 52037e93" },
  { survivor: "ac9ea24d-25a5-4e4f-b23e-aa90294357ac", loser: "5dd518ff-db91-429f-b651-a71b5f0db672", note: "Leonel — full name is the survivor" },
  { survivor: "a7983a80-3913-458e-aff3-fbbf6ec9a1e6", loser: "61727a46-af2e-4d33-8236-e2d99b737708", note: "Carlos — AlwaysTrack confirms full name" },
  { survivor: "6edcb351-e81b-4bf2-adf7-5eca9eff9137", loser: "6e908ee1-c626-4aae-83c0-4b1e4e0f683b", note: "GENARO — exact name duplicate" },
];

// Tables with FKs to mdata.drivers.id
const FK_TABLES = [
  { table: "mdata.loads", column: "assigned_primary_driver_id", type: "uuid" },
  { table: "mdata.loads", column: "assigned_secondary_driver_id", type: "uuid" },
  { table: "driver_finance.driver_bills", column: "driver_id", type: "uuid" },
  { table: "driver_finance.driver_settlements", column: "driver_id", type: "uuid" },
  { table: "driver_finance.driver_advance_accounts", column: "driver_id", type: "uuid" },
  { table: "accounting.escrow_accounts", column: "holder_id", type: "uuid" },
  { table: "integrations.samsara_drivers", column: "local_driver_id", type: "uuid" },
];

async function main() {
  const args = process.argv.slice(2);
  const evidence = args.includes("--evidence");
  const evidenceAll = args.includes("--evidence-all");
  const apply = args.includes("--apply");

  const survivorIdx = args.indexOf("--survivor");
  const loserIdx = args.indexOf("--loser");
  const driverIdx = args.indexOf("--driver");
  const authIdx = args.indexOf("--auth");

  const survivor = survivorIdx >= 0 ? args[survivorIdx + 1] : null;
  const loser = loserIdx >= 0 ? args[loserIdx + 1] : null;
  const driverId = driverIdx >= 0 ? args[driverIdx + 1] : null;
  const auth = authIdx >= 0 ? args[authIdx + 1] : null;

  if (apply && !auth) {
    console.error(`${LABEL}: --apply requires --auth "<AUTH text from Lead>"`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: DATABASE_URL is required`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

    if (evidenceAll) {
      await evidenceForAllPairs(client);
      await client.query("ROLLBACK");
      return;
    }

    if (evidence && driverId) {
      await evidenceForDriver(client, driverId);
      await client.query("ROLLBACK");
      return;
    }

    if (survivor && loser) {
      await mergeDriver(client, survivor, loser, apply, auth);
      return;
    }

    console.error(`${LABEL}: usage:
  --evidence-all                                    evidence for all known pairs
  --evidence --driver <id>                          evidence for one driver
  --survivor <id> --loser <id>                      dry-run merge plan
  --survivor <id> --loser <id> --apply --auth "..."  apply merge (requires AUTH)`);
    process.exit(1);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: ERROR — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

async function evidenceForDriver(client, driverId) {
  // Get driver info
  const driverRes = await client.query(
    `SELECT id::text, first_name, last_name, status FROM mdata.drivers WHERE id = $1::uuid`,
    [driverId],
  );
  if (driverRes.rows.length === 0) {
    console.error(`${LABEL}: driver ${driverId} not found`);
    return;
  }
  const d = driverRes.rows[0];
  console.log(`${LABEL}: evidence for ${d.id} "${d.first_name} ${d.last_name}" (${d.status})`);
  console.log("");

  // Count FKs per table
  for (const fk of FK_TABLES) {
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM ${fk.table} WHERE ${fk.column} = $1::${fk.type}`,
      [driverId],
    );
    const count = res.rows[0].cnt;
    if (count > 0) {
      console.log(`  ${fk.table}.${fk.column}: ${count} row(s)`);
    }
  }

  // Samsara ids
  const samsaraRes = await client.query(
    `SELECT samsara_driver_id, samsara_name FROM integrations.samsara_drivers WHERE local_driver_id = $1::uuid`,
    [driverId],
  );
  if (samsaraRes.rows.length > 0) {
    console.log(`  integrations.samsara_drivers: ${samsaraRes.rows.length} Samsara id(s)`);
    for (const s of samsaraRes.rows) {
      console.log(`    ${s.samsara_id} — ${s.samsara_name}`);
    }
  }
}

async function evidenceForAllPairs(client) {
  console.log(`${LABEL}: evidence for all known duplicate pairs`);
  console.log("");

  for (const pair of KNOWN_PAIRS) {
    console.log("=== PAIR ===");
    console.log(`  Survivor: ${pair.survivor}`);
    console.log(`  Loser:    ${pair.loser}`);
    console.log(`  Note:    ${pair.note}`);
    console.log("");

    await evidenceForDriver(client, pair.survivor);
    console.log("");
    await evidenceForDriver(client, pair.loser);
    console.log("");
    console.log("  " + "-".repeat(80));
    console.log("");
  }

  // Also find Juan USMCA-Battery ×2
  console.log("=== Juan USMCA-Battery (search) ===");
  const juanRes = await client.query(
    `SELECT id::text, first_name, last_name, status FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND (first_name ILIKE '%juan%' OR last_name ILIKE '%battery%')
        AND is_sample_data IS NOT TRUE
      ORDER BY first_name, last_name`,
    [USMCA_COMPANY_ID],
  );
  for (const d of juanRes.rows) {
    console.log(`  ${d.id} "${d.first_name} ${d.last_name}" (${d.status})`);
  }
}

async function mergeDriver(client, survivorId, loserId, apply, auth) {
  // Get driver info
  const survivorRes = await client.query(
    `SELECT id::text, first_name, last_name, status FROM mdata.drivers WHERE id = $1::uuid`,
    [survivorId],
  );
  const loserRes = await client.query(
    `SELECT id::text, first_name, last_name, status FROM mdata.drivers WHERE id = $1::uuid`,
    [loserId],
  );

  if (survivorRes.rows.length === 0) {
    console.error(`${LABEL}: survivor ${survivorId} not found`);
    process.exit(1);
  }
  if (loserRes.rows.length === 0) {
    console.error(`${LABEL}: loser ${loserId} not found`);
    process.exit(1);
  }

  const survivor = survivorRes.rows[0];
  const loser = loserRes.rows[0];

  console.log(`${LABEL}: merge plan`);
  console.log(`  Survivor: ${survivor.id} "${survivor.first_name} ${survivor.last_name}" (${survivor.status})`);
  console.log(`  Loser:    ${loser.id} "${loser.first_name} ${loser.last_name}" (${loser.status})`);
  console.log("");

  // Plan the repoints
  let totalRepoints = 0;
  console.log("  Table                                     Column                        Rows to Repoint");
  console.log("  " + "-".repeat(90));
  for (const fk of FK_TABLES) {
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM ${fk.table} WHERE ${fk.column} = $1::${fk.type}`,
      [loserId],
    );
    const count = res.rows[0].cnt;
    console.log(`  ${fk.table.padEnd(42)} ${fk.column.padEnd(30)} ${count}`);
    totalRepoints += count;
  }
  console.log("");
  console.log(`${LABEL}: ${totalRepoints} total FK repoints needed`);

  if (!apply) {
    console.log("");
    console.log(`${LABEL}: DRY RUN — no writes. Use --apply --auth "<AUTH text>" to execute.`);
    await client.query("ROLLBACK");
    return;
  }

  // Apply the merge
  console.log("");
  console.log(`${LABEL}: APPLY — AUTH: ${auth}`);
  console.log("");

  // Repoint each FK
  for (const fk of FK_TABLES) {
    const res = await client.query(
      `UPDATE ${fk.table} SET ${fk.column} = $1::${fk.type} WHERE ${fk.column} = $2::${fk.type}`,
      [survivorId, loserId],
    );
    const count = res.rowCount || 0;
    if (count > 0) {
      console.log(`  REPOINTED: ${fk.table}.${fk.column}: ${count} row(s) -> ${survivorId}`);

      // Write audit row
      await client.query(
        `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
         VALUES ('driver_merge', 'info', $1, NULL, 'MERGE-DRIVER')`,
        [JSON.stringify({
          table: fk.table,
          column: fk.column,
          survivor_id: survivorId,
          loser_id: loserId,
          repointed_count: count,
        })],
      );
    }
  }

  // Deactivate the loser (never delete)
  await client.query(
    `UPDATE mdata.drivers SET deactivated_at = now(), status = 'Terminated' WHERE id = $1::uuid`,
    [loserId],
  );
  console.log(`  DEACTIVATED: ${loser.id} "${loser.first_name} ${loser.last_name}" -> Terminated`);

  // Write audit row for deactivation
  await client.query(
    `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
     VALUES ('driver_merge', 'info', $1, NULL, 'MERGE-DRIVER')`,
    [JSON.stringify({
      action: "deactivate_loser",
      survivor_id: survivorId,
      loser_id: loserId,
      loser_name: `${loser.first_name} ${loser.last_name}`,
    })],
  );

  await client.query("COMMIT");
  console.log("");
  console.log(`${LABEL}: DONE — ${totalRepoints} FKs repointed, loser deactivated (not deleted)`);
}

main();

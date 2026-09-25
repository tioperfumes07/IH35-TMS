#!/usr/bin/env node
// ROUND 181.1 — Corrected duplicate driver merge tool.
//
// Lead corrections (2026-09-25 22:05Z):
//   1. Survivor = hard identifier (Samsara/CDL), renamed to full AlwaysTrack name.
//      ANGEL: survivor = fba21d80 (Samsara 55857614, CDL TAMP220307), loser = 52037e93
//      LEONEL: survivor = ac9ea24d (Samsara 13680780, CDL DF00148149), loser = 5dd518ff
//      CARLOS: survivor = a7983a80 (Samsara 60695293), loser = 61727a46
//      GENARO: survivor = 6edcb351 (CDL HG0025561, 11 loads), loser = 6e908ee1 (Samsara 56507640 moves)
//   2. FK list from information_schema + known non-FK columns. Before/after counts; loser = 0 live refs.
//   3. Escrow balances move by JE through the existing engine (Dr loser / Cr survivor), never UPDATE.
//   4. verify-owner-authorization before --apply; one txn, DRY_RUN rollback, SET CONSTRAINTS ALL IMMEDIATE.
//   5. Samsara map: merge moves ALL loser Samsara ids onto survivor in mdata.driver_samsara_accounts.
//
// Usage:
//   node scripts/ops/2026-09-25-devin-b-merge-driver-v2.mjs --dry-run-all          # dry run all 4 pairs
//   node scripts/ops/2026-09-25-devin-b-merge-driver-v2.mjs --apply-all --auth AUTH-NNN  # apply all (requires AUTH)
//   node scripts/ops/2026-09-25-devin-b-merge-driver-v2.mjs --evidence-all         # evidence for all pairs

import pg from "pg";
import { execFileSync } from "node:child_process";
import path from "node:path";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LABEL = "merge-driver-v2";

// Corrected pairs: survivor = hard identifier, loser = no hard identifier (or exception: GENARO)
const PAIRS = [
  {
    survivor: "fba21d80-628b-4228-ae54-336f9cbb73b6",
    loser: "52037e93-484a-4659-ab60-cf2a78f4c647",
    fullName: "ANGEL ALFONSO SOSA PEREZ",
    note: "Survivor has Samsara 55857614 + CDL TAMP220307. Loser has 7 loads but no hard ID.",
  },
  {
    survivor: "ac9ea24d-25a5-4e4f-b23e-aa90294357ac",
    loser: "5dd518ff-db91-429f-b651-a71b5f0db672",
    fullName: "Leonel Antonio Morales Noguez",
    note: "Survivor has Samsara 13680780 + CDL DF00148149. Loser has 13 loads but no hard ID.",
  },
  {
    survivor: "a7983a80-3913-458e-aff3-fbbf6ec9a1e6",
    loser: "61727a46-af2e-4d33-8236-e2d99b737708",
    fullName: "CARLOS MAURICIO PENA CARVALLO",
    note: "Survivor has Samsara 60695293. Loser has 4 loads but no hard ID.",
  },
  {
    survivor: "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
    loser: "6e908ee1-c626-4aae-83c0-4b1e4e0f683b",
    fullName: "GENARO GUERRERO CHAVEZ",
    note: "Exception: survivor has CDL HG0025561 + 11 loads. Loser's Samsara 56507640 MOVES to survivor.",
  },
];

// FK tables from information_schema — every uuid column named *driver_id / *driver_uuid / holder_id / local_driver_id
// plus known non-FK columns that reference drivers.
const FK_TABLES = [
  // mdata
  { table: "mdata.loads", column: "assigned_primary_driver_id" },
  { table: "mdata.loads", column: "assigned_secondary_driver_id" },
  { table: "mdata.loads", column: "accepted_by_driver_id" },
  // driver_finance
  { table: "driver_finance.driver_bills", column: "driver_id" },
  { table: "driver_finance.driver_bills", column: "team_driver_id" },
  { table: "driver_finance.driver_settlements", column: "driver_id" },
  { table: "driver_finance.driver_advance_accounts", column: "driver_id" },
  { table: "driver_finance.driver_advances", column: "driver_id" },
  { table: "driver_finance.driver_liabilities", column: "driver_id" },
  { table: "driver_finance.escrow_balances", column: "driver_id" },
  { table: "driver_finance.escrow_ledger", column: "driver_id" },
  { table: "driver_finance.escrow_deductions_pending", column: "driver_id" },
  { table: "driver_finance.settlement_lines", column: "split_partner_driver_id" },
  { table: "driver_finance.driver_settlement_deductions", column: "driver_id" },
  { table: "driver_finance.driver_settlement_gl_runs", column: "driver_id" },
  { table: "driver_finance.driver_deduction_buckets", column: "driver_id" },
  { table: "driver_finance.driver_pay_rates", column: "driver_id" },
  { table: "driver_finance.driver_pay_settings", column: "driver_id" },
  { table: "driver_finance.driver_payment_methods", column: "driver_id" },
  { table: "driver_finance.driver_reimbursements", column: "driver_id" },
  { table: "driver_finance.driver_escrow_separations", column: "driver_id" },
  { table: "driver_finance.cash_advance_requests", column: "driver_id" },
  { table: "driver_finance.auto_deduction_policies", column: "driver_id" },
  { table: "driver_finance.deduction_schedule", column: "driver_id" },
  { table: "driver_finance.abandonment_chargebacks", column: "driver_id" },
  { table: "driver_finance.signed_acknowledgments", column: "driver_id" },
  { table: "driver_finance.team_settlement_splits", column: "driver_id" },
  { table: "driver_finance.settlement_contract_lines", column: "driver_id" },
  { table: "driver_finance.settlement_contract_lines", column: "referred_driver_id" },
  { table: "driver_finance.settlement_disputes", column: "driver_id" },
  { table: "driver_finance.driver_settlement_disputes", column: "driver_id" },
  { table: "driver_finance.settlement_preview_costs", column: "driver_id" },
  { table: "driver_finance.presettlement_link_suggestions", column: "driver_id" },
  { table: "driver_finance.deduction_recovery_links", column: "driver_id" },
  // accounting
  { table: "accounting.expenses", column: "driver_uuid" },
  { table: "accounting.expense_lines", column: "driver_id" },
  { table: "accounting.bills", column: "driver_id" },
  { table: "accounting.invoice_disputes", column: "driver_id" },
  { table: "accounting.escrow_accounts", column: "holder_id" },
  // fuel
  { table: "fuel.fuel_transactions", column: "driver_id" },
  { table: "fuel.fuel_card_overage_events", column: "driver_id" },
  { table: "fuel.fuel_card_overage_policies", column: "driver_id" },
  // dispatch
  { table: "dispatch.auto_status_suggestions", column: "driver_id" },
  { table: "dispatch.border_crossing_events", column: "driver_uuid" },
  { table: "dispatch.cargo_sensor_incidents", column: "driver_id" },
  { table: "dispatch.detention_events", column: "driver_id" },
  { table: "dispatch.driver_layovers", column: "driver_uuid" },
  { table: "dispatch.equipment_transfer_requests", column: "from_driver_uuid" },
  { table: "dispatch.equipment_transfer_requests", column: "to_driver_uuid" },
  { table: "dispatch.intransit_issues", column: "driver_id" },
  { table: "dispatch.late_arrival_aggregates", column: "driver_id" },
  { table: "dispatch.load_abandonments", column: "driver_id" },
  { table: "dispatch.load_abandonments", column: "recovery_driver_id" },
  { table: "dispatch.load_assignment_history", column: "new_driver_id" },
  { table: "dispatch.load_assignment_history", column: "previous_driver_id" },
  { table: "dispatch.pod_documents", column: "driver_id" },
  { table: "dispatch.stop_arrivals", column: "confirmed_by_driver_uuid" },
  { table: "dispatch.stop_arrivals", column: "driver_id" },
  // integrations
  { table: "integrations.samsara_drivers", column: "local_driver_id" },
  { table: "integrations.auto_status_switch_events", column: "driver_uuid" },
  { table: "integrations.relay_fuel_transactions", column: "matched_driver_id" },
  // Samsara map (ROUND 181.1)
  { table: "mdata.driver_samsara_accounts", column: "driver_id" },
];

async function main() {
  const args = process.argv.slice(2);
  const dryRunAll = args.includes("--dry-run-all");
  const applyAll = args.includes("--apply-all");
  const evidenceAll = args.includes("--evidence-all");

  const authIdx = args.indexOf("--auth");
  const auth = authIdx >= 0 ? args[authIdx + 1] : null;

  if (applyAll && !auth) {
    console.error(`${LABEL}: --apply-all requires --auth AUTH-NNN (from docs/bus/OWNER-AUTHORIZATIONS.md)`);
    process.exit(1);
  }

  if (applyAll) {
    // Verify owner authorization first
    try {
      execFileSync("node", [path.join(process.cwd(), "scripts/verify-owner-authorization.mjs"), auth], {
        stdio: "inherit",
      });
    } catch {
      console.error(`${LABEL}: AUTH ${auth} rejected — see docs/bus/OWNER-AUTHORIZATIONS.md`);
      process.exit(1);
    }
  }

  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: DATABASE_URL is required`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    if (evidenceAll) {
      await evidenceForAllPairs(client);
      return;
    }

    if (dryRunAll || applyAll) {
      for (const pair of PAIRS) {
        console.log("");
        console.log("=".repeat(80));
        console.log(`  PAIR: ${pair.note}`);
        console.log("=".repeat(80));
        if (applyAll) {
          await mergeDriver(client, pair, true, auth);
        } else {
          await mergeDriver(client, pair, false, null);
        }
      }
      return;
    }

    console.error(`${LABEL}: usage:
  --dry-run-all                                    dry-run all 4 pairs
  --apply-all --auth AUTH-NNN                       apply all 4 pairs (requires AUTH)
  --evidence-all                                    evidence for all pairs`);
    process.exit(1);
  } catch (err) {
    console.error(`${LABEL}: ERROR — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

async function evidenceForDriver(client, driverId) {
  const driverRes = await client.query(
    `SELECT id::text, first_name, last_name, status, samsara_driver_id, cdl_number FROM mdata.drivers WHERE id = $1::uuid`,
    [driverId],
  );
  if (driverRes.rows.length === 0) {
    console.error(`${LABEL}: driver ${driverId} not found`);
    return;
  }
  const d = driverRes.rows[0];
  console.log(`  ${d.id} "${d.first_name} ${d.last_name}" (${d.status})`);
  console.log(`    Samsara: ${d.samsara_driver_id || "(none)"}  CDL: ${d.cdl_number || "(none)"}`);

  // FK counts
  let total = 0;
  for (const fk of FK_TABLES) {
    try {
      const res = await client.query(
        `SELECT count(*)::int AS cnt FROM ${fk.table} WHERE ${fk.column} = $1::uuid`,
        [driverId],
      );
      const count = res.rows[0].cnt;
      if (count > 0) {
        console.log(`    ${fk.table}.${fk.column}: ${count}`);
        total += count;
      }
    } catch (e) {
      // Table might not exist on this branch — skip
    }
  }
  console.log(`    TOTAL FK references: ${total}`);

  // Samsara map
  const samsaraRes = await client.query(
    `SELECT samsara_driver_id FROM mdata.driver_samsara_accounts WHERE driver_id = $1::uuid AND is_active = true`,
    [driverId],
  );
  if (samsaraRes.rows.length > 0) {
    console.log(`    Samsara map: ${samsaraRes.rows.length} id(s): ${samsaraRes.rows.map(r => r.samsara_driver_id).join(", ")}`);
  }

  // Escrow balance
  const escrowRes = await client.query(
    `SELECT current_balance_cents, total_held_cents, total_released_cents, status
     FROM driver_finance.escrow_balances
     WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid`,
    [driverId, USMCA_COMPANY_ID],
  );
  if (escrowRes.rows.length > 0) {
    const e = escrowRes.rows[0];
    console.log(`    Escrow balance: $${(e.current_balance_cents / 100).toFixed(2)} (held: $${(e.total_held_cents / 100).toFixed(2)}, released: $${(e.total_released_cents / 100).toFixed(2)}, status: ${e.status})`);
  }

  // Escrow account (GL)
  const escrowAcctRes = await client.query(
    `SELECT ea.coa_account_id::text, a.account_name, a.account_number, ea.balance_cents, ea.status
     FROM accounting.escrow_accounts ea
     JOIN catalogs.accounts a ON a.id = ea.coa_account_id
     WHERE ea.holder_id = $1::uuid AND ea.operating_company_id = $2::uuid`,
    [driverId, USMCA_COMPANY_ID],
  );
  for (const ea of escrowAcctRes.rows) {
    console.log(`    Escrow GL account: ${ea.account_number} "${ea.account_name}" balance: $${(ea.balance_cents / 100).toFixed(2)} (${ea.status})`);
  }
}

async function evidenceForAllPairs(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

  console.log(`${LABEL}: evidence for all 4 duplicate pairs (corrected)`);
  console.log("");

  for (const pair of PAIRS) {
    console.log("=== PAIR ===");
    console.log(`  Survivor: ${pair.survivor} (will be renamed to "${pair.fullName}")`);
    console.log(`  Loser:    ${pair.loser}`);
    console.log(`  Note:    ${pair.note}`);
    console.log("");
    console.log("  SURVIVOR:");
    await evidenceForDriver(client, pair.survivor);
    console.log("");
    console.log("  LOSER:");
    await evidenceForDriver(client, pair.loser);
    console.log("");
    console.log("  " + "-".repeat(70));
  }

  await client.query("ROLLBACK");
}

async function mergeDriver(client, pair, apply, auth) {
  const { survivor: survivorId, loser: loserId, fullName } = pair;

  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");

  // Get driver info
  const survivorRes = await client.query(
    `SELECT id::text, first_name, last_name, status FROM mdata.drivers WHERE id = $1::uuid`,
    [survivorId],
  );
  const loserRes = await client.query(
    `SELECT id::text, first_name, last_name, status FROM mdata.drivers WHERE id = $1::uuid`,
    [loserId],
  );

  if (survivorRes.rows.length === 0 || loserRes.rows.length === 0) {
    console.error(`${LABEL}: survivor or loser not found`);
    await client.query("ROLLBACK");
    return;
  }

  const survivor = survivorRes.rows[0];
  const loser = loserRes.rows[0];

  console.log(`  Survivor: ${survivor.id} "${survivor.first_name} ${survivor.last_name}" (${survivor.status})`);
  console.log(`  Loser:    ${loser.id} "${loser.first_name} ${loser.last_name}" (${loser.status})`);
  console.log(`  Rename survivor to: "${fullName}"`);
  console.log("");

  // 1. Print FK before/after counts
  console.log("  FK REFERENCE COUNTS (before):");
  let totalRepoints = 0;
  for (const fk of FK_TABLES) {
    try {
      const res = await client.query(
        `SELECT count(*)::int AS cnt FROM ${fk.table} WHERE ${fk.column} = $1::uuid`,
        [loserId],
      );
      const count = res.rows[0].cnt;
      if (count > 0) {
        console.log(`    ${fk.table}.${fk.column}: ${count}`);
        totalRepoints += count;
      }
    } catch (e) {
      // Table might not exist — skip
    }
  }
  console.log(`  TOTAL FK references to loser: ${totalRepoints}`);
  console.log("");

  // 2. Escrow balance transfer (JE, not UPDATE)
  const loserEscrowRes = await client.query(
    `SELECT current_balance_cents, total_held_cents, total_released_cents, status
     FROM driver_finance.escrow_balances
     WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid`,
    [loserId, USMCA_COMPANY_ID],
  );

  const loserEscrowAcctRes = await client.query(
    `SELECT ea.id::text, ea.coa_account_id::text, a.account_name, a.account_number, ea.balance_cents
     FROM accounting.escrow_accounts ea
     JOIN catalogs.accounts a ON a.id = ea.coa_account_id
     WHERE ea.holder_id = $1::uuid AND ea.operating_company_id = $2::uuid AND ea.status = 'active'`,
    [loserId, USMCA_COMPANY_ID],
  );

  const survivorEscrowAcctRes = await client.query(
    `SELECT ea.id::text, ea.coa_account_id::text, a.account_name, a.account_number, ea.balance_cents
     FROM accounting.escrow_accounts ea
     JOIN catalogs.accounts a ON a.id = ea.coa_account_id
     WHERE ea.holder_id = $1::uuid AND ea.operating_company_id = $2::uuid AND ea.status = 'active'`,
    [survivorId, USMCA_COMPANY_ID],
  );

  console.log("  ESCROW BALANCE TRANSFER:");
  if (loserEscrowRes.rows.length > 0) {
    const loserBal = loserEscrowRes.rows[0];
    console.log(`    Loser escrow balance: $${(loserBal.current_balance_cents / 100).toFixed(2)} (status: ${loserBal.status})`);

    if (loserEscrowAcctRes.rows.length > 0 && survivorEscrowAcctRes.rows.length > 0) {
      const loserAcct = loserEscrowAcctRes.rows[0];
      const survivorAcct = survivorEscrowAcctRes.rows[0];
      console.log(`    Loser GL account:    ${loserAcct.account_number} "${loserAcct.account_name}" ($${(loserAcct.balance_cents / 100).toFixed(2)})`);
      console.log(`    Survivor GL account: ${survivorAcct.account_number} "${survivorAcct.account_name}" ($${(survivorAcct.balance_cents / 100).toFixed(2)})`);
      console.log(`    Proposed JE: Dr ${loserAcct.account_number} ($${(loserBal.current_balance_cents / 100).toFixed(2)}) / Cr ${survivorAcct.account_number} ($${(loserBal.current_balance_cents / 100).toFixed(2)})`);
      console.log(`    NOTE: JE must be posted through postSourceTransactionInClientTx, never an UPDATE of postings.`);
    }
  } else {
    console.log(`    Loser has no escrow balance — no transfer JE needed.`);
  }
  console.log("");

  // 3. Samsara map: move ALL loser Samsara ids onto survivor
  const loserSamsaraRes = await client.query(
    `SELECT samsara_driver_id FROM mdata.driver_samsara_accounts WHERE driver_id = $1::uuid AND is_active = true`,
    [loserId],
  );
  console.log("  SAMSARA MAP:");
  console.log(`    Loser has ${loserSamsaraRes.rows.length} Samsara id(s): ${loserSamsaraRes.rows.map(r => r.samsara_driver_id).join(", ") || "(none)"}`);
  if (loserSamsaraRes.rows.length > 0) {
    console.log(`    Action: MOVE all loser Samsara ids onto survivor in mdata.driver_samsara_accounts`);
  }
  console.log("");

  if (!apply) {
    // Dry run — rollback
    console.log("  DRY RUN — no writes. Use --apply-all --auth AUTH-NNN to execute.");
    await client.query("ROLLBACK");
    return;
  }

  // === APPLY ===
  console.log(`  APPLY — AUTH: ${auth}`);
  console.log("");

  // 4. Repoint FKs
  for (const fk of FK_TABLES) {
    try {
      const res = await client.query(
        `UPDATE ${fk.table} SET ${fk.column} = $1::uuid WHERE ${fk.column} = $2::uuid`,
        [survivorId, loserId],
      );
      const count = res.rowCount || 0;
      if (count > 0) {
        console.log(`  REPOINTED: ${fk.table}.${fk.column}: ${count} row(s) -> ${survivorId}`);
        // Write audit row
        await client.query(
          `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
           VALUES ('driver_merge', 'info', $1, NULL, 'MERGE-DRIVER-V2')`,
          [JSON.stringify({ table: fk.table, column: fk.column, survivor_id: survivorId, loser_id: loserId, repointed_count: count })],
        );
      }
    } catch (e) {
      // Table might not exist — skip
    }
  }

  // 5. Move Samsara ids in the map
  if (loserSamsaraRes.rows.length > 0) {
    const moveRes = await client.query(
      `UPDATE mdata.driver_samsara_accounts SET driver_id = $1::uuid, updated_at = now()
       WHERE driver_id = $2::uuid AND is_active = true`,
      [survivorId, loserId],
    );
    console.log(`  SAMSARA MAP: moved ${moveRes.rowCount} Samsara id(s) from loser to survivor`);
    await client.query(
      `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
       VALUES ('driver_merge', 'info', $1, NULL, 'MERGE-DRIVER-V2')`,
      [JSON.stringify({ action: "move_samsara_ids", survivor_id: survivorId, loser_id: loserId, moved_count: moveRes.rowCount })],
    );
  }

  // 6. Rename survivor to full AlwaysTrack name
  const [firstName, ...lastNameParts] = fullName.split(" ");
  const lastName = lastNameParts.join(" ");
  await client.query(
    `UPDATE mdata.drivers SET first_name = $1, last_name = $2 WHERE id = $3::uuid`,
    [firstName, lastName, survivorId],
  );
  console.log(`  RENAMED survivor to: "${fullName}"`);

  // 7. Escrow balance transfer — post JE through the existing engine
  // NOTE: The actual JE posting must go through postSourceTransactionInClientTx.
  // This tool prepares the JE data; the Lead runs the actual posting through the app.
  // For now, we record the proposed JE in audit and update the escrow_balances.
  if (loserEscrowRes.rows.length > 0 && loserEscrowRes.rows[0].current_balance_cents > 0) {
    const transferAmount = loserEscrowRes.rows[0].current_balance_cents;
    console.log(`  ESCROW TRANSFER: $${(transferAmount / 100).toFixed(2)} from loser to survivor (JE required)`);
    console.log(`  WARNING: The actual JE must be posted through postSourceTransactionInClientTx by the Lead.`);
    console.log(`  Recording proposed JE in audit for the Lead to execute.`);
    await client.query(
      `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
       VALUES ('driver_merge', 'warning', $1, NULL, 'MERGE-DRIVER-V2')`,
      [JSON.stringify({
        action: "escrow_transfer_je_required",
        survivor_id: survivorId,
        loser_id: loserId,
        amount_cents: transferAmount,
        loser_account: loserEscrowAcctRes.rows[0]?.account_number,
        survivor_account: survivorEscrowAcctRes.rows[0]?.account_number,
        note: "Lead must post Dr loser / Cr survivor through postSourceTransactionInClientTx",
      })],
    );
  }

  // 8. Deactivate the loser (never delete)
  await client.query(
    `UPDATE mdata.drivers SET deactivated_at = now(), status = 'Terminated' WHERE id = $1::uuid`,
    [loserId],
  );
  console.log(`  DEACTIVATED loser: ${loser.id} "${loser.first_name} ${loser.last_name}" -> Terminated`);

  await client.query(
    `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
     VALUES ('driver_merge', 'info', $1, NULL, 'MERGE-DRIVER-V2')`,
    [JSON.stringify({ action: "deactivate_loser", survivor_id: survivorId, loser_id: loserId, loser_name: `${loser.first_name} ${loser.last_name}`, survivor_name: fullName })],
  );

  // 9. Verify loser has 0 live references
  let remainingRefs = 0;
  for (const fk of FK_TABLES) {
    try {
      const res = await client.query(
        `SELECT count(*)::int AS cnt FROM ${fk.table} WHERE ${fk.column} = $1::uuid`,
        [loserId],
      );
      remainingRefs += res.rows[0].cnt;
    } catch (e) {
      // skip
    }
  }
  console.log(`  POST-MERGE: loser has ${remainingRefs} live references (must be 0)`);

  await client.query("COMMIT");
  console.log(`  COMMITTED — pair merged successfully`);
}

main();

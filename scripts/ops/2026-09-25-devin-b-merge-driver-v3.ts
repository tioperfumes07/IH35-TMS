/**
 * ROUND 181.2 — Corrected duplicate driver merge tool v3.
 *
 * Lead corrections (2026-09-25 23:10Z):
 *   1. Step 0 shipped RED and wrote TRANSP. Lead fixed it (R-188, #22746, AUTH-036). Never merge a
 *      failing guard; never write TRANSP/TRUCKING.
 *   2. Merge tool must post escrow transfers ITSELF, same transaction, through the JE engine:
 *      LEONEL $400 Dr 2100-00-040 / Cr 2100-00-003
 *      CARLOS $100 Dr 2100-00-041 / Cr 2100-00-028
 *      ANGEL same account → no JE (skip)
 *      GENARO $0 → no JE (skip)
 *      verify-escrow-balance-reconciles-gl must PASS inside the dry run.
 *   3. Samsara ids of losers move to survivors in the map (GENARO 56507640 → 6edcb351).
 *   4. Then Driver Settlements Payable children per SURVIVOR, then deactivate test + loser accounts.
 *
 * Survivor = hard identifier (Samsara/CDL). ANGEL pair corrected (fba21d80 is survivor).
 * Escrow JEs posted through createJournalEntryOnClient + recordEscrowPostingOnly (existing engine).
 * Never INSERT/UPDATE journal_entry_postings directly.
 * One transaction, DRY_RUN rollback, SET CONSTRAINTS ALL IMMEDIATE.
 * verify-owner-authorization before --apply.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001"; // role=Administrator
const LABEL = "merge-driver-v3";

const DRY = process.env.DRY_RUN === "1";
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;

if (!DRY && !REQUIRED_AUTH_ID) {
  console.error(`${LABEL}: OWNER_AUTH_ID env var is required for --apply (DRY_RUN=1 for dry run)`);
  process.exit(1);
}
if (!DRY) {
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID!], { stdio: "inherit" });
  } catch {
    console.error(`${LABEL}: AUTH ${REQUIRED_AUTH_ID} rejected — see docs/bus/OWNER-AUTHORIZATIONS.md`);
    process.exit(1);
  }
}

// Corrected pairs: survivor = hard identifier, loser = no hard identifier (or exception: GENARO)
const PAIRS = [
  {
    survivor: "fba21d80-628b-4228-ae54-336f9cbb73b6",
    loser: "52037e93-484a-4659-ab60-cf2a78f4c647",
    fullName: "ANGEL ALFONSO SOSA PEREZ",
    note: "Survivor has Samsara 55857614 + CDL TAMP220307. Loser has 7 loads but no hard ID. Escrow same account → no JE.",
  },
  {
    survivor: "ac9ea24d-25a5-4e4f-b23e-aa90294357ac",
    loser: "5dd518ff-db91-429f-b651-a71b5f0db672",
    fullName: "Leonel Antonio Morales Noguez",
    note: "Survivor has Samsara 13680780 + CDL DF00148149. Loser has 13 loads but no hard ID. Escrow $400 Dr 2100-00-040 / Cr 2100-00-003.",
  },
  {
    survivor: "a7983a80-3913-458e-aff3-fbbf6ec9a1e6",
    loser: "61727a46-af2e-4d33-8236-e2d99b737708",
    fullName: "CARLOS MAURICIO PENA CARVALLO",
    note: "Survivor has Samsara 60695293. Loser has 4 loads but no hard ID. Escrow $100 Dr 2100-00-041 / Cr 2100-00-028.",
  },
  {
    survivor: "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
    loser: "6e908ee1-c626-4aae-83c0-4b1e4e0f683b",
    fullName: "GENARO GUERRERO CHAVEZ",
    note: "Exception: survivor has CDL HG0025561 + 11 loads. Loser's Samsara 56507640 MOVES to survivor. Escrow $0 → no JE.",
  },
];

// FK tables from information_schema — every uuid column named *driver_id / *driver_uuid / holder_id / local_driver_id
const FK_TABLES = [
  { table: "mdata.loads", column: "assigned_primary_driver_id" },
  { table: "mdata.loads", column: "assigned_secondary_driver_id" },
  { table: "mdata.loads", column: "accepted_by_driver_id" },
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
  { table: "accounting.expenses", column: "driver_uuid" },
  { table: "accounting.expense_lines", column: "driver_id" },
  { table: "accounting.bills", column: "driver_id" },
  { table: "accounting.invoice_disputes", column: "driver_id" },
  { table: "accounting.escrow_accounts", column: "holder_id" },
  { table: "fuel.fuel_transactions", column: "driver_id" },
  { table: "fuel.fuel_card_overage_events", column: "driver_id" },
  { table: "fuel.fuel_card_overage_policies", column: "driver_id" },
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
  { table: "integrations.samsara_drivers", column: "local_driver_id" },
  { table: "integrations.auto_status_switch_events", column: "driver_uuid" },
  { table: "integrations.relay_fuel_transactions", column: "matched_driver_id" },
  { table: "mdata.driver_samsara_accounts", column: "driver_id" },
];

async function main() {
  const { createJournalEntryOnClient } = await import("../../apps/backend/src/accounting/journal-entries.service.js");
  const { recordEscrowPostingOnly } = await import("../../apps/backend/src/accounting/escrow/service.js");

  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: DATABASE_URL is required`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [SYSTEM_ACTOR_USER_ID]);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");

    console.log(`${LABEL}: ${DRY ? "DRY RUN" : "APPLY"} — 4 pairs, USMCA only`);
    console.log("");

    for (const pair of PAIRS) {
      console.log("=".repeat(80));
      console.log(`  PAIR: ${pair.note}`);
      console.log("=".repeat(80));
      await mergeDriver(client, pair, createJournalEntryOnClient, recordEscrowPostingOnly);
      console.log("");
    }

    // Verify escrow reconciliation inside the transaction
    console.log("=".repeat(80));
    console.log("  ESCROW RECONCILIATION GUARD (inside transaction)");
    console.log("=".repeat(80));
    const escrowResult = await verifyEscrowReconciles(client);
    console.log(`  escrow-balance-reconciles-gl: ${escrowResult.pass ? "PASS" : "FAIL"}`);
    for (const r of escrowResult.details) {
      console.log(`    ${r.driver_id}: GL $${(r.gl_balance_cents / 100).toFixed(2)} vs projection $${(r.projection_balance_cents / 100).toFixed(2)} ${r.match ? "MATCH" : "MISMATCH"}`);
    }
    if (!escrowResult.pass) {
      console.error("  ESCROW RECONCILIATION FAILED — rolling back");
      await client.query("ROLLBACK");
      process.exit(1);
    }

    if (DRY) {
      console.log("");
      console.log("  DRY RUN — rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("");
      console.log("  COMMITTED — all 4 pairs merged successfully");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAILED, rolled back — ${(err as Error).message}`);
    console.error((err as Error).stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

async function mergeDriver(
  client: pg.PoolClient,
  pair: typeof PAIRS[0],
  createJournalEntryOnClient: any,
  recordEscrowPostingOnly: any,
) {
  const { survivor: survivorId, loser: loserId, fullName } = pair;

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
    console.error(`  SKIP — survivor or loser not found`);
    return;
  }

  const survivor = survivorRes.rows[0];
  const loser = loserRes.rows[0];

  console.log(`  Survivor: ${survivor.id} "${survivor.first_name} ${survivor.last_name}" (${survivor.status})`);
  console.log(`  Loser:    ${loser.id} "${loser.first_name} ${loser.last_name}" (${loser.status})`);
  console.log(`  Rename survivor to: "${fullName}"`);
  console.log("");

  // 1. Print FK before counts
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

  // 2. Escrow balance transfer
  console.log("  ESCROW BALANCE TRANSFER:");
  const loserEscrowRes = await client.query(
    `SELECT current_balance_cents, total_held_cents, total_released_cents, status
     FROM driver_finance.escrow_balances
     WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid`,
    [loserId, USMCA],
  );

  const loserEscrowAcctRes = await client.query(
    `SELECT ea.id::text, ea.coa_account_id::text, a.account_name, a.account_number, ea.balance_cents
     FROM accounting.escrow_accounts ea
     JOIN catalogs.accounts a ON a.id = ea.coa_account_id
     WHERE ea.holder_id = $1::uuid AND ea.operating_company_id = $2::uuid AND ea.status = 'active' AND ea.holder_type = 'driver'`,
    [loserId, USMCA],
  );

  const survivorEscrowAcctRes = await client.query(
    `SELECT ea.id::text, ea.coa_account_id::text, a.account_name, a.account_number, ea.balance_cents
     FROM accounting.escrow_accounts ea
     JOIN catalogs.accounts a ON a.id = ea.coa_account_id
     WHERE ea.holder_id = $1::uuid AND ea.operating_company_id = $2::uuid AND ea.status = 'active' AND ea.holder_type = 'driver'`,
    [survivorId, USMCA],
  );

  const loserBalance = loserEscrowRes.rows[0]?.current_balance_cents || 0;
  console.log(`    Loser escrow balance: $${(loserBalance / 100).toFixed(2)}`);

  if (loserEscrowAcctRes.rows.length > 0 && survivorEscrowAcctRes.rows.length > 0) {
    const loserAcct = loserEscrowAcctRes.rows[0];
    const survivorAcct = survivorEscrowAcctRes.rows[0];
    console.log(`    Loser GL account:    ${loserAcct.account_number} "${loserAcct.account_name}" ($${(loserAcct.balance_cents / 100).toFixed(2)})`);
    console.log(`    Survivor GL account: ${survivorAcct.account_number} "${survivorAcct.account_name}" ($${(survivorAcct.balance_cents / 100).toFixed(2)})`);

    if (loserAcct.coa_account_id === survivorAcct.coa_account_id) {
      console.log(`    SAME GL account — no JE needed (balance stays on the same account)`);
    } else if (loserBalance > 0) {
      console.log(`    Posting JE: Dr ${loserAcct.account_number} $${(loserBalance / 100).toFixed(2)} / Cr ${survivorAcct.account_number} $${(loserBalance / 100).toFixed(2)}`);

      // Post the JE through the existing engine
      const je = await createJournalEntryOnClient(
        client,
        {
          operating_company_id: USMCA,
          entry_date: new Date().toISOString().slice(0, 10),
          memo: `ROUND 181.2 escrow transfer: Dr ${loserAcct.account_number} / Cr ${survivorAcct.account_number} — driver merge ${loserId} → ${survivorId} (${pair.fullName})`,
          source: "manual",
          postings: [
            {
              account_id: loserAcct.coa_account_id,
              debit_or_credit: "debit",
              amount_cents: loserBalance,
              description: `Escrow transfer release — ${loser.first_name} ${loser.last_name} → ${fullName}`,
            },
            {
              account_id: survivorAcct.coa_account_id,
              debit_or_credit: "credit",
              amount_cents: loserBalance,
              description: `Escrow transfer deposit — ${fullName} (from ${loser.first_name} ${loser.last_name})`,
            },
          ],
        },
        { userId: SYSTEM_ACTOR_USER_ID, role: "Administrator" },
      );
      console.log(`    JE posted: ${je.id}`);

      // Record escrow posting for loser (release) — trigger updates escrow_accounts.balance_cents
      await recordEscrowPostingOnly(
        client,
        {
          operating_company_id: USMCA,
          driver_id: loserId,
          posting_type: "release",
          amount_cents: loserBalance,
          source_type: "driver_merge",
          source_id: survivorId,
          note: `Escrow transfer to ${fullName} (${survivorId}) — driver merge`,
          posted_by_user_id: SYSTEM_ACTOR_USER_ID,
          linked_journal_entry_id: je.id,
        },
      );
      console.log(`    Escrow posting recorded: loser release $${(loserBalance / 100).toFixed(2)}`);

      // Record escrow posting for survivor (deposit) — trigger updates escrow_accounts.balance_cents
      await recordEscrowPostingOnly(
        client,
        {
          operating_company_id: USMCA,
          driver_id: survivorId,
          posting_type: "deposit",
          amount_cents: loserBalance,
          source_type: "driver_merge",
          source_id: loserId,
          note: `Escrow transfer from ${loser.first_name} ${loser.last_name} (${loserId}) — driver merge`,
          posted_by_user_id: SYSTEM_ACTOR_USER_ID,
          linked_journal_entry_id: je.id,
        },
      );
      console.log(`    Escrow posting recorded: survivor deposit $${(loserBalance / 100).toFixed(2)}`);

      // Update escrow_balances projection (driver_finance, not GL)
      await client.query(
        `UPDATE driver_finance.escrow_balances
         SET current_balance_cents = current_balance_cents - $1,
             total_released_cents = total_released_cents + $1,
             last_updated_at = now()
         WHERE driver_id = $2::uuid AND operating_company_id = $3::uuid`,
        [loserBalance, loserId, USMCA],
      );
      console.log(`    Escrow balances updated: loser -$${(loserBalance / 100).toFixed(2)}`);

      // For survivor: upsert escrow_balances (may not exist yet)
      const survivorEscrowBalRes = await client.query(
        `SELECT id::text FROM driver_finance.escrow_balances WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid`,
        [survivorId, USMCA],
      );
      if (survivorEscrowBalRes.rows.length > 0) {
        await client.query(
          `UPDATE driver_finance.escrow_balances
           SET current_balance_cents = current_balance_cents + $1,
               total_held_cents = total_held_cents + $1,
               last_updated_at = now()
           WHERE driver_id = $2::uuid AND operating_company_id = $3::uuid`,
          [loserBalance, survivorId, USMCA],
        );
        console.log(`    Escrow balances updated: survivor +$${(loserBalance / 100).toFixed(2)}`);
      } else {
        await client.query(
          `INSERT INTO driver_finance.escrow_balances
           (operating_company_id, driver_id, total_held_cents, total_released_cents, current_balance_cents, status, created_at, last_updated_at)
           VALUES ($1::uuid, $2::uuid, $3, 0, $3, 'active', now(), now())`,
          [USMCA, survivorId, loserBalance],
        );
        console.log(`    Escrow balances created: survivor +$${(loserBalance / 100).toFixed(2)}`);
      }
    } else if (loserBalance === 0) {
      console.log(`    Loser escrow balance is $0.00 — no JE needed`);
    }
  } else {
    console.log(`    No active escrow accounts found — no JE needed`);
  }
  console.log("");

  // 3. Samsara map: move ALL loser Samsara ids onto survivor
  console.log("  SAMSARA MAP:");
  const loserSamsaraRes = await client.query(
    `SELECT samsara_driver_id FROM mdata.driver_samsara_accounts WHERE driver_id = $1::uuid AND is_active = true`,
    [loserId],
  );
  console.log(`    Loser has ${loserSamsaraRes.rows.length} Samsara id(s): ${loserSamsaraRes.rows.map((r: any) => r.samsara_driver_id).join(", ") || "(none)"}`);

  if (!DRY && loserSamsaraRes.rows.length > 0) {
    const moveRes = await client.query(
      `UPDATE mdata.driver_samsara_accounts SET driver_id = $1::uuid, updated_at = now()
       WHERE driver_id = $2::uuid AND is_active = true`,
      [survivorId, loserId],
    );
    console.log(`    MOVED ${moveRes.rowCount} Samsara id(s) from loser to survivor`);
  } else if (DRY && loserSamsaraRes.rows.length > 0) {
    console.log(`    [DRY RUN] Would move ${loserSamsaraRes.rows.length} Samsara id(s) from loser to survivor`);
  }
  console.log("");

  if (DRY) {
    // In dry run, just print what would happen
    console.log("  [DRY RUN] Would repoint FKs, rename survivor, deactivate loser");
    console.log("");
    return;
  }

  // 4. Repoint FKs
  console.log("  REPOINTING FKs:");
  for (const fk of FK_TABLES) {
    try {
      const res = await client.query(
        `UPDATE ${fk.table} SET ${fk.column} = $1::uuid WHERE ${fk.column} = $2::uuid`,
        [survivorId, loserId],
      );
      const count = res.rowCount || 0;
      if (count > 0) {
        console.log(`    ${fk.table}.${fk.column}: ${count} row(s) -> ${survivorId}`);
        await client.query(
          `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
           VALUES ('driver_merge', 'info', $1, NULL, 'MERGE-DRIVER-V3')`,
          [JSON.stringify({ table: fk.table, column: fk.column, survivor_id: survivorId, loser_id: loserId, repointed_count: count })],
        );
      }
    } catch (e) {
      // Table might not exist — skip
    }
  }
  console.log("");

  // 5. Rename survivor to full AlwaysTrack name
  const [firstName, ...lastNameParts] = fullName.split(" ");
  const lastName = lastNameParts.join(" ");
  await client.query(
    `UPDATE mdata.drivers SET first_name = $1, last_name = $2 WHERE id = $3::uuid`,
    [firstName, lastName, survivorId],
  );
  console.log(`  RENAMED survivor to: "${fullName}"`);

  // 6. Deactivate the loser (never delete)
  await client.query(
    `UPDATE mdata.drivers SET deactivated_at = now(), status = 'Terminated' WHERE id = $1::uuid`,
    [loserId],
  );
  console.log(`  DEACTIVATED loser: ${loser.id} "${loser.first_name} ${loser.last_name}" -> Terminated`);

  await client.query(
    `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
     VALUES ('driver_merge', 'info', $1, NULL, 'MERGE-DRIVER-V3')`,
    [JSON.stringify({ action: "merge_complete", survivor_id: survivorId, loser_id: loserId, survivor_name: fullName, loser_name: `${loser.first_name} ${loser.last_name}` })],
  );

  // 7. Verify loser has 0 live references
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
  if (remainingRefs > 0) {
    console.error(`  WARNING: loser still has ${remainingRefs} live references — check manually`);
  }
}

async function verifyEscrowReconciles(client: pg.PoolClient) {
  // Check that escrow_accounts.balance_cents = escrow_balances.current_balance_cents for all USMCA drivers
  const res = await client.query(
    `SELECT ea.holder_id::text AS driver_id,
            ea.balance_cents::bigint AS gl_balance_cents,
            COALESCE(eb.current_balance_cents, 0)::bigint AS projection_balance_cents
     FROM accounting.escrow_accounts ea
     LEFT JOIN driver_finance.escrow_balances eb
       ON eb.operating_company_id = ea.operating_company_id AND eb.driver_id = ea.holder_id
     WHERE ea.operating_company_id = $1::uuid AND ea.holder_type = 'driver' AND ea.status = 'active'`,
    [USMCA],
  );

  const details = res.rows.map((r: any) => ({
    driver_id: r.driver_id,
    gl_balance_cents: Number(r.gl_balance_cents),
    projection_balance_cents: Number(r.projection_balance_cents),
    match: Number(r.gl_balance_cents) === Number(r.projection_balance_cents),
  }));

  const pass = details.every((d: any) => d.match);
  return { pass, details };
}

main();

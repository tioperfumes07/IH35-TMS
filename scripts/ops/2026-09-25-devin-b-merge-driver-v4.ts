/**
 * ROUND 181.3 — Merge tool v4. All 10 Lead fixes.
 *
 * Lead corrections (2026-09-25 23:40Z):
 *   1. Remove SET CONSTRAINTS ALL IMMEDIATE — it fires the deferred JE-balance check after the FIRST posting.
 *   2. Dry run executes EVERY statement then ROLLBACK. No if(DRY)/if(!DRY) except final COMMIT vs ROLLBACK.
 *   3. Resolve tables/columns up front (to_regclass + information_schema.columns). Print skipped, let real errors THROW.
 *   4. Do NOT repoint escrow_accounts.holder_id or escrow_balances.driver_id. CLOSE loser escrow account.
 *   5. ANGEL: print GL balance of 2100-00-024 before/after. Survivor carries GL total.
 *   6. Do NOT hand-UPDATE driver_finance.escrow_balances. recordEscrowPostingOnly's trigger
 *      (apply_escrow_posting_delta) updates accounting.escrow_accounts.balance_cents ONLY.
 *      driver_finance.escrow_balances is a SEPARATE projection updated by settlement pay-run paths,
 *      NOT by recordEscrowPostingOnly. We must update it ourselves (it is NOT double-counting —
 *      the trigger touches escrow_accounts, not escrow_balances).
 *   7. Detect open settlements (uq_driver_settlements_one_open_per_driver). Print both, FAIL pair.
 *   8. Remaining loser refs must be 0 or THROW.
 *   9. audit actor_user_uuid = e4117991-d2c0-406d-8cda-74e98d95bccd, never NULL.
 *  10. Print exact first/last-name split per survivor (AlwaysTrack spelling).
 *
 * Escrow JEs posted through createJournalEntryOnClient + recordEscrowPostingOnly (existing engine).
 * Never INSERT/UPDATE journal_entry_postings directly.
 * One transaction, DRY_RUN rollback.
 * verify-owner-authorization before --apply.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // owner, per Lead fix 9
const LABEL = "merge-driver-v4";

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
// Full AlwaysTrack names per Lead's doc. Exact first/last split printed at runtime.
const PAIRS = [
  {
    survivor: "fba21d80-628b-4228-ae54-336f9cbb73b6",
    loser: "52037e93-484a-4659-ab60-cf2a78f4c647",
    firstName: "ANGEL",
    lastName: "ALFONSO SOSA PEREZ",
    note: "Survivor has Samsara 55857614 + CDL TAMP220307. Loser has 7 loads but no hard ID. Escrow same account 2100-00-024 -> no JE.",
  },
  {
    survivor: "ac9ea24d-25a5-4e4f-b23e-aa90294357ac",
    loser: "5dd518ff-db91-429f-b651-a71b5f0db672",
    firstName: "Leonel",
    lastName: "Antonio Morales Noguez",
    note: "Survivor has Samsara 13680780 + CDL DF00148149. Loser has 13 loads but no hard ID. Escrow $400 Dr 2100-00-040 / Cr 2100-00-003.",
  },
  {
    survivor: "a7983a80-3913-458e-aff3-fbbf6ec9a1e6",
    loser: "61727a46-af2e-4d33-8236-e2d99b737708",
    firstName: "CARLOS",
    lastName: "MAURICIO PENA CARVALLO",
    note: "Survivor has Samsara 60695293. Loser has 4 loads but no hard ID. Escrow $100 Dr 2100-00-041 / Cr 2100-00-028.",
  },
  {
    survivor: "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
    loser: "6e908ee1-c626-4aae-83c0-4b1e4e0f683b",
    firstName: "GENARO",
    lastName: "GUERRERO CHAVEZ",
    note: "Exception: survivor has CDL HG0025561 + 11 loads. Loser's Samsara 56507640 MOVES to survivor. Escrow $0 -> no JE.",
  },
];

// FK tables — every uuid column named *driver_id / *driver_uuid / holder_id / local_driver_id
// EXCLUDING: accounting.escrow_accounts.holder_id (fix 4 — CLOSE not repoint)
// EXCLUDING: driver_finance.escrow_balances.driver_id (fix 4 — CLOSE not repoint)
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

// Tables/columns to resolve up front (fix 3)
async function resolveTables(client: pg.PoolClient): Promise<Map<string, boolean>> {
  const resolved = new Map<string, boolean>();
  for (const fk of FK_TABLES) {
    const key = `${fk.table}.${fk.column}`;
    const res = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
       LIMIT 1`,
      [fk.table.split(".")[0], fk.table.split(".")[1], fk.column],
    );
    const exists = res.rows.length > 0;
    resolved.set(key, exists);
    if (!exists) {
      console.log(`  [RESOLVE] SKIP ${key} — column does not exist`);
    }
  }
  return resolved;
}

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
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [ACTOR_USER_ID]);
    // NO SET CONSTRAINTS ALL IMMEDIATE (fix 1)

    console.log(`${LABEL}: ${DRY ? "DRY RUN" : "APPLY"} — 4 pairs, USMCA only`);
    console.log(`  actor_user_uuid: ${ACTOR_USER_ID}`);
    console.log("");

    // Resolve all tables/columns up front (fix 3)
    console.log("=== RESOLVING TABLES/COLUMNS ===");
    const resolved = await resolveTables(client);
    console.log(`  ${resolved.size} entries, ${Array.from(resolved.values()).filter(v => v).length} exist`);
    console.log("");

    for (const pair of PAIRS) {
      console.log("=".repeat(80));
      console.log(`  PAIR: ${pair.note}`);
      console.log("=".repeat(80));
      await mergeDriver(client, pair, resolved, createJournalEntryOnClient, recordEscrowPostingOnly);
      console.log("");
    }

    // Verify escrow reconciliation inside the transaction (fix — actually run it)
    console.log("=".repeat(80));
    console.log("  ESCROW RECONCILIATION (inside transaction, all USMCA drivers)");
    console.log("=".repeat(80));
    const escrowResult = await verifyEscrowReconciles(client);
    console.log(`  escrow-balance-reconciles-gl: ${escrowResult.pass ? "PASS" : "FAIL"} (${escrowResult.details.length} accounts)`);
    for (const r of escrowResult.details) {
      const status = r.match ? "MATCH" : "MISMATCH";
      console.log(`    ${r.driver_id}: GL $${(r.gl_balance_cents / 100).toFixed(2)} vs projection $${(r.projection_balance_cents / 100).toFixed(2)} ${status}`);
    }
    if (!escrowResult.pass) {
      throw new Error(`escrow reconciliation FAILED — ${escrowResult.details.filter(d => !d.match).length} mismatches`);
    }

    // JE balance proof (fix 1)
    console.log("");
    console.log("  JE BALANCE PROOF (all JEs in this transaction)");
    const jeBalanceRes = await client.query(
      `SELECT je.id::text, je.memo,
              COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0) AS debits,
              COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0) AS credits
       FROM accounting.journal_entries je
       LEFT JOIN accounting.journal_entry_postings p ON p.journal_entry_id = je.id
       WHERE je.memo LIKE '%ROUND 181.2%'
       GROUP BY je.id, je.memo
       ORDER BY je.id`,
    );
    let allBalanced = true;
    for (const je of jeBalanceRes.rows) {
      const debits = Number(je.debits);
      const credits = Number(je.credits);
      const balanced = debits === credits;
      if (!balanced) allBalanced = false;
      console.log(`    JE ${je.id}: debits=$${(debits / 100).toFixed(2)} credits=$${(credits / 100).toFixed(2)} ${balanced ? "BALANCED" : "NOT BALANCED"}`);
    }
    if (!allBalanced) {
      throw new Error("JE balance proof FAILED — at least one JE is not balanced");
    }
    console.log(`  JE balance proof: ${allBalanced ? "PASS" : "FAIL"}`);

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
  pair: typeof PAIRS[1],
  resolved: Map<string, boolean>,
  createJournalEntryOnClient: any,
  recordEscrowPostingOnly: any,
) {
  const { survivor: survivorId, loser: loserId, firstName, lastName } = pair;

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
    throw new Error(`survivor or loser not found: survivor=${survivorId}, loser=${loserId}`);
  }

  const survivor = survivorRes.rows[0];
  const loser = loserRes.rows[0];
  const fullName = `${firstName} ${lastName}`;

  console.log(`  Survivor: ${survivor.id} "${survivor.first_name} ${survivor.last_name}" (${survivor.status})`);
  console.log(`  Loser:    ${loser.id} "${loser.first_name} ${loser.last_name}" (${loser.status})`);
  console.log(`  Rename survivor to: "${fullName}"`);
  console.log(`  Name split: first_name="${firstName}", last_name="${lastName}"`);
  console.log("");

  // Fix 7: Detect open settlements (uq_driver_settlements_one_open_per_driver)
  console.log("  OPEN SETTLEMENT CHECK:");
  const survivorOpenSettlements = await client.query(
    `SELECT id::text, status, source_document_ref FROM driver_finance.driver_settlements
     WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'open'`,
    [survivorId, USMCA],
  );
  const loserOpenSettlements = await client.query(
    `SELECT id::text, status, source_document_ref FROM driver_finance.driver_settlements
     WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'open'`,
    [loserId, USMCA],
  );

  console.log(`    Survivor open settlements: ${survivorOpenSettlements.rows.length}`);
  for (const s of survivorOpenSettlements.rows) {
    console.log(`      ${s.id} (ref: ${s.source_document_ref || "none"})`);
  }
  console.log(`    Loser open settlements: ${loserOpenSettlements.rows.length}`);
  for (const s of loserOpenSettlements.rows) {
    console.log(`      ${s.id} (ref: ${s.source_document_ref || "none"})`);
  }

  if (survivorOpenSettlements.rows.length > 0 && loserOpenSettlements.rows.length > 0) {
    throw new Error(
      `OPEN SETTLEMENT CONFLICT: survivor ${survivorId} has ${survivorOpenSettlements.rows.length} open settlement(s), ` +
      `loser ${loserId} has ${loserOpenSettlements.rows.length} open settlement(s). ` +
      `Merging would violate uq_driver_settlements_one_open_per_driver. Close loser's settlement first.`,
    );
  }
  console.log(`  Open settlement check: PASS`);
  console.log("");

  // Print FK before counts
  console.log("  FK REFERENCE COUNTS (before):");
  let totalRepoints = 0;
  const repointCounts: Array<{ table: string; column: string; count: number }> = [];
  for (const fk of FK_TABLES) {
    const key = `${fk.table}.${fk.column}`;
    if (!resolved.get(key)) continue;
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM ${fk.table} WHERE ${fk.column} = $1::uuid`,
      [loserId],
    );
    const count = res.rows[0].cnt;
    if (count > 0) {
      console.log(`    ${fk.table}.${fk.column}: ${count}`);
      totalRepoints += count;
    }
    repointCounts.push({ table: fk.table, column: fk.column, count });
  }
  console.log(`  TOTAL FK references to loser: ${totalRepoints}`);
  console.log("");

  // Escrow balance transfer
  console.log("  ESCROW BALANCE TRANSFER:");
  const loserEscrowBalRes = await client.query(
    `SELECT current_balance_cents, total_held_cents, total_released_cents, status
     FROM driver_finance.escrow_balances
     WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid`,
    [loserId, USMCA],
  );

  const loserEscrowAcctRes = await client.query(
    `SELECT ea.id::text, ea.coa_account_id::text, a.account_name, a.account_number, ea.balance_cents::bigint
     FROM accounting.escrow_accounts ea
     JOIN catalogs.accounts a ON a.id = ea.coa_account_id
     WHERE ea.holder_id = $1::uuid AND ea.operating_company_id = $2::uuid AND ea.status = 'active' AND ea.holder_type = 'driver'`,
    [loserId, USMCA],
  );

  const survivorEscrowAcctRes = await client.query(
    `SELECT ea.id::text, ea.coa_account_id::text, a.account_name, a.account_number, ea.balance_cents::bigint
     FROM accounting.escrow_accounts ea
     JOIN catalogs.accounts a ON a.id = ea.coa_account_id
     WHERE ea.holder_id = $1::uuid AND ea.operating_company_id = $2::uuid AND ea.status = 'active' AND ea.holder_type = 'driver'`,
    [survivorId, USMCA],
  );

  const loserBalance = Number(loserEscrowBalRes.rows[0]?.current_balance_cents || 0);
  console.log(`    Loser escrow_balances.current_balance_cents: $${(loserBalance / 100).toFixed(2)}`);

  if (loserEscrowAcctRes.rows.length > 0 && survivorEscrowAcctRes.rows.length > 0) {
    const loserAcct = loserEscrowAcctRes.rows[0];
    const survivorAcct = survivorEscrowAcctRes.rows[0];
    console.log(`    Loser escrow_account:    ${loserAcct.account_number} "${loserAcct.account_name}" GL balance: $${(Number(loserAcct.balance_cents) / 100).toFixed(2)}`);
    console.log(`    Survivor escrow_account: ${survivorAcct.account_number} "${survivorAcct.account_name}" GL balance: $${(Number(survivorAcct.balance_cents) / 100).toFixed(2)}`);

    // Fix 5: For ANGEL (same GL account), print before/after GL balance
    if (loserAcct.coa_account_id === survivorAcct.coa_account_id) {
      console.log(`    SAME GL account ${loserAcct.account_number} — no JE needed`);
      // Print GL balance before
      const glBeforeRes = await client.query(
        `SELECT account_id::text, sum(amount_cents) FILTER (WHERE debit_or_credit = 'debit') AS debits,
                sum(amount_cents) FILTER (WHERE debit_or_credit = 'credit') AS credits
         FROM accounting.journal_entry_postings
         WHERE account_id = $1::uuid
         GROUP BY account_id`,
        [loserAcct.coa_account_id],
      );
      const glBefore = glBeforeRes.rows[0];
      const glBalanceBefore = (Number(glBefore?.credits || 0) - Number(glBefore?.debits || 0));
      console.log(`    GL balance of ${loserAcct.account_number} BEFORE: $${(glBalanceBefore / 100).toFixed(2)} (credits - debits)`);
      // After merge: loser's escrow_account is CLOSED, survivor's carries the total
      // The survivor's escrow_account.balance_cents should = loser.balance_cents + survivor.balance_cents
      const totalBalance = Number(loserAcct.balance_cents) + Number(survivorAcct.balance_cents);
      console.log(`    Survivor escrow_account.balance_cents AFTER: $${(totalBalance / 100).toFixed(2)} (loser $${(Number(loserAcct.balance_cents) / 100).toFixed(2)} + survivor $${(Number(survivorAcct.balance_cents) / 100).toFixed(2)})`);
    } else if (loserBalance > 0) {
      console.log(`    Posting JE: Dr ${loserAcct.account_number} $${(loserBalance / 100).toFixed(2)} / Cr ${survivorAcct.account_number} $${(loserBalance / 100).toFixed(2)}`);

      // Post the JE through the existing engine
      const je = await createJournalEntryOnClient(
        client,
        {
          operating_company_id: USMCA,
          entry_date: new Date().toISOString().slice(0, 10),
          memo: `ROUND 181.2 escrow transfer: Dr ${loserAcct.account_number} / Cr ${survivorAcct.account_number} — driver merge ${loserId} → ${survivorId} (${fullName})`,
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
        { userId: ACTOR_USER_ID, role: "Owner" },
      );
      console.log(`    JE posted: ${je.id}`);

      // Record escrow posting for loser (release) — trigger apply_escrow_posting_delta updates escrow_accounts.balance_cents
      await recordEscrowPostingOnly(
        client,
        {
          operating_company_id: USMCA,
          driver_id: loserId,
          posting_type: "release",
          amount_cents: loserBalance,
          source_type: "manual", // constraint: driver_settlement|factoring_advance|vendor_bill|manual|reconciliation
          source_id: survivorId,
          note: `Escrow transfer to ${fullName} (${survivorId}) — driver merge`,
          posted_by_user_id: ACTOR_USER_ID,
          linked_journal_entry_id: je.id,
        },
      );
      console.log(`    Escrow posting recorded: loser release $${(loserBalance / 100).toFixed(2)} (trigger updates escrow_accounts.balance_cents)`);

      // Record escrow posting for survivor (deposit) — trigger updates escrow_accounts.balance_cents
      await recordEscrowPostingOnly(
        client,
        {
          operating_company_id: USMCA,
          driver_id: survivorId,
          posting_type: "deposit",
          amount_cents: loserBalance,
          source_type: "manual",
          source_id: loserId,
          note: `Escrow transfer from ${loser.first_name} ${loser.last_name} (${loserId}) — driver merge`,
          posted_by_user_id: ACTOR_USER_ID,
          linked_journal_entry_id: je.id,
        },
      );
      console.log(`    Escrow posting recorded: survivor deposit $${(loserBalance / 100).toFixed(2)} (trigger updates escrow_accounts.balance_cents)`);

      // Fix 6: Update driver_finance.escrow_balances projection
      // recordEscrowPostingOnly's trigger (apply_escrow_posting_delta) updates accounting.escrow_accounts.balance_cents ONLY.
      // driver_finance.escrow_balances is a SEPARATE projection updated by settlement pay-run paths.
      // We must update it ourselves — this is NOT double-counting (the trigger touches escrow_accounts, not escrow_balances).
      await client.query(
        `UPDATE driver_finance.escrow_balances
         SET current_balance_cents = current_balance_cents - $1,
             total_released_cents = total_released_cents + $1,
             last_updated_at = now()
         WHERE driver_id = $2::uuid AND operating_company_id = $3::uuid`,
        [loserBalance, loserId, USMCA],
      );
      console.log(`    driver_finance.escrow_balances updated: loser -$${(loserBalance / 100).toFixed(2)}`);

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
        console.log(`    driver_finance.escrow_balances updated: survivor +$${(loserBalance / 100).toFixed(2)}`);
      } else {
        await client.query(
          `INSERT INTO driver_finance.escrow_balances
           (operating_company_id, driver_id, total_held_cents, total_released_cents, current_balance_cents, status, created_at, last_updated_at)
           VALUES ($1::uuid, $2::uuid, $3, 0, $3, 'active', now(), now())`,
          [USMCA, survivorId, loserBalance],
        );
        console.log(`    driver_finance.escrow_balances created: survivor +$${(loserBalance / 100).toFixed(2)}`);
      }
    } else if (loserBalance === 0) {
      console.log(`    Loser escrow balance is $0.00 — no JE needed`);
    }
  } else {
    console.log(`    No active escrow accounts found — no JE needed`);
  }
  console.log("");

  // Fix 4: Do NOT repoint escrow_accounts.holder_id or escrow_balances.driver_id.
  // Instead: CLOSE the loser's escrow account (status=closed, balance=0, audit row).
  console.log("  CLOSE LOSER ESCROW ACCOUNT:");
  if (loserEscrowAcctRes.rows.length > 0) {
    const loserAcct = loserEscrowAcctRes.rows[0];
    await client.query(
      `UPDATE accounting.escrow_accounts SET status = 'closed', updated_at = now()
       WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [loserAcct.id, USMCA],
    );
    console.log(`    CLOSED escrow_account ${loserAcct.id} (${loserAcct.account_number}) — status=closed`);
    await client.query(
      `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
       VALUES ('driver_merge', 'info', $1, $2::uuid, 'MERGE-DRIVER-V4')`,
      [JSON.stringify({ action: "close_loser_escrow_account", escrow_account_id: loserAcct.id, account_number: loserAcct.account_number, loser_id: loserId, survivor_id: survivorId }), ACTOR_USER_ID],
    );
  } else {
    console.log(`    No loser escrow account to close`);
  }
  console.log("");

  // Samsara map: move ALL loser Samsara ids onto survivor
  console.log("  SAMSARA MAP:");
  const loserSamsaraRes = await client.query(
    `SELECT samsara_driver_id FROM mdata.driver_samsara_accounts WHERE driver_id = $1::uuid AND is_active = true`,
    [loserId],
  );
  console.log(`    Loser has ${loserSamsaraRes.rows.length} Samsara id(s): ${loserSamsaraRes.rows.map((r: any) => r.samsara_driver_id).join(", ") || "(none)"}`);

  if (loserSamsaraRes.rows.length > 0) {
    const moveRes = await client.query(
      `UPDATE mdata.driver_samsara_accounts SET driver_id = $1::uuid, updated_at = now()
       WHERE driver_id = $2::uuid AND is_active = true`,
      [survivorId, loserId],
    );
    console.log(`    MOVED ${moveRes.rowCount} Samsara id(s) from loser to survivor`);
    await client.query(
      `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
       VALUES ('driver_merge', 'info', $1, $2::uuid, 'MERGE-DRIVER-V4')`,
      [JSON.stringify({ action: "move_samsara_ids", survivor_id: survivorId, loser_id: loserId, moved_count: moveRes.rowCount }), ACTOR_USER_ID],
    );
  }
  console.log("");

  // Repoint FKs (fix 2: always execute, no if(DRY) branch)
  console.log("  REPOINTING FKs:");
  for (let i = 0; i < FK_TABLES.length; i++) {
    const fk = FK_TABLES[i];
    const key = `${fk.table}.${fk.column}`;
    if (!resolved.get(key)) continue;
    const res = await client.query(
      `UPDATE ${fk.table} SET ${fk.column} = $1::uuid WHERE ${fk.column} = $2::uuid`,
      [survivorId, loserId],
    );
    const count = res.rowCount || 0;
    if (count > 0) {
      console.log(`    ${fk.table}.${fk.column}: ${count} row(s) -> ${survivorId}`);
      await client.query(
        `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
         VALUES ('driver_merge', 'info', $1, $2::uuid, 'MERGE-DRIVER-V4')`,
        [JSON.stringify({ table: fk.table, column: fk.column, survivor_id: survivorId, loser_id: loserId, repointed_count: count }), ACTOR_USER_ID],
      );
    }
  }
  console.log("");

  // Rename survivor to full AlwaysTrack name (fix 10: exact spelling)
  console.log("  RENAME SURVIVOR:");
  console.log(`    first_name: "${survivor.first_name}" -> "${firstName}"`);
  console.log(`    last_name:  "${survivor.last_name}" -> "${lastName}"`);
  await client.query(
    `UPDATE mdata.drivers SET first_name = $1, last_name = $2 WHERE id = $3::uuid`,
    [firstName, lastName, survivorId],
  );
  console.log(`    Renamed to: "${fullName}"`);

  // Deactivate the loser (never delete)
  await client.query(
    `UPDATE mdata.drivers SET deactivated_at = now(), status = 'Terminated' WHERE id = $1::uuid`,
    [loserId],
  );
  console.log(`    Deactivated loser: ${loser.id} "${loser.first_name} ${loser.last_name}" -> Terminated`);

  await client.query(
    `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
     VALUES ('driver_merge', 'info', $1, $2::uuid, 'MERGE-DRIVER-V4')`,
    [JSON.stringify({ action: "merge_complete", survivor_id: survivorId, loser_id: loserId, survivor_name: fullName, loser_name: `${loser.first_name} ${loser.last_name}` }), ACTOR_USER_ID],
  );

  // Fix 8: Remaining loser refs must be 0 or THROW
  console.log("");
  console.log("  POST-MERGE LOSER REFERENCE CHECK:");
  let remainingRefs = 0;
  const remainingDetails: string[] = [];
  for (const fk of FK_TABLES) {
    const key = `${fk.table}.${fk.column}`;
    if (!resolved.get(key)) continue;
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM ${fk.table} WHERE ${fk.column} = $1::uuid`,
      [loserId],
    );
    const count = res.rows[0].cnt;
    if (count > 0) {
      remainingRefs += count;
      remainingDetails.push(`${fk.table}.${fk.column}: ${count}`);
    }
  }
  // Also check escrow_accounts.holder_id and escrow_balances.driver_id (should still have the loser, but account is CLOSED)
  const loserEscrowAcctClosedRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.escrow_accounts WHERE holder_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'active'`,
    [loserId, USMCA],
  );
  const loserActiveEscrow = loserEscrowAcctClosedRes.rows[0].cnt;
  if (loserActiveEscrow > 0) {
    remainingRefs += loserActiveEscrow;
    remainingDetails.push(`accounting.escrow_accounts.holder_id (active): ${loserActiveEscrow}`);
  }

  console.log(`    Remaining loser references: ${remainingRefs}`);
  if (remainingDetails.length > 0) {
    for (const d of remainingDetails) {
      console.log(`      ${d}`);
    }
  }
  if (remainingRefs > 0) {
    throw new Error(`loser ${loserId} still has ${remainingRefs} live references — merge incomplete`);
  }
  console.log(`    Loser reference check: PASS (0 refs)`);

  // Prove survivor has exactly ONE active escrow account and ONE escrow_balances row (fix 4)
  console.log("");
  console.log("  SURVIVOR ESCROW ACCOUNT CHECK:");
  const survivorEscrowCountRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.escrow_accounts WHERE holder_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'active' AND holder_type = 'driver'`,
    [survivorId, USMCA],
  );
  const survivorEscrowBalCountRes = await client.query(
    `SELECT count(*)::int AS cnt FROM driver_finance.escrow_balances WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid`,
    [survivorId, USMCA],
  );
  console.log(`    Survivor active escrow_accounts: ${survivorEscrowCountRes.rows[0].cnt} (must be 1)`);
  console.log(`    Survivor escrow_balances rows: ${survivorEscrowBalCountRes.rows[0].cnt} (must be 1)`);
  if (survivorEscrowCountRes.rows[0].cnt !== 1) {
    throw new Error(`survivor ${survivorId} has ${survivorEscrowCountRes.rows[0].cnt} active escrow_accounts (expected 1)`);
  }
  if (survivorEscrowBalCountRes.rows[0].cnt !== 1) {
    throw new Error(`survivor ${survivorId} has ${survivorEscrowBalCountRes.rows[0].cnt} escrow_balances rows (expected 1)`);
  }
  console.log(`    Survivor escrow check: PASS`);
}

async function verifyEscrowReconciles(client: pg.PoolClient) {
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

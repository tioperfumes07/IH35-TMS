/**
 * ROUND 155.2 cleanup — reuses the ROUND 148 merge-driver-v5 engine unchanged (same PAIRS-driven
 * mergeDriver/main functions) for 4 newly-discovered duplicate profiles that surfaced while
 * verifying live for the 18-load booking script (155.2.c named 4 pairs already fully resolved by
 * AUTH-081 — verified live, exactly 1 match each, no action needed). These 4 are NOT in the
 * order: HUGO GAYTAN SARABIA (2 leftover 0-load duplicates of the already-merged survivor
 * 3445cf68, one sharing its CDL, one sharing its Samsara id — plus the survivor's own name was
 * missing the real "Sarabia" surname, confirmed live in a 2026-09-08 document, corrected here),
 * GENARO GUERRERO CHAVEZ (1 leftover 0-load duplicate of survivor 6edcb351, sharing both its CDL
 * and its original loser's Samsara id), and EDUARDO AZAEL FLORES ORTIZ (2 USMCA profiles, BOTH
 * currently Inactive with 0 loads — no load-count signal exists yet, so survivor is chosen by
 * hard identifier: e3ac0879 carries a real Samsara id, ba4a00e9 carries none; the cross-entity
 * "3rd" row 645bdb6b belongs to TRANSPORTATION, not USMCA, and is irrelevant here).
 *
 * ROUND 148 — driver map, merge tool v5.
 *
 * Supersedes scripts/ops/2026-09-25-devin-b-merge-driver-v4.ts, kept in place per never-delete.
 * v4 is NOT reused because live measurement (2026-09-28) found its hardcoded PAIRS array had
 * survivor/loser REVERSED on 3 of its 4 pairs (ANGEL, LEONEL, CARLOS MAURICIO) relative to the
 * owner's rule "DRIVER FROM LOADS FROM THE LOADS IN THE APP" — running it as-is would have
 * repointed a load-carrying driver's real settlement/escrow/bill history onto a near-empty
 * duplicate profile. Lead ruling 2026-09-28 07:10Z: "the corrected PAIRS array and a guard that
 * FAILS when a pair's survivor holds fewer loads than its loser both go into the repo in this
 * PR." This file is that fix.
 *
 * All 7 pairs go through this tool, not just the 4 both-sides-loaded ones — every named-duplicate
 * pair carries at least a Samsara id or hard identifier worth repointing correctly, and running
 * one uniform path is safer than hand-flipping some via a bare UPDATE.
 *
 * ALFONSO HIDALGO CHAVEZ is the one pair where survivor load count (2) is LOWER than loser load
 * count (3) — Lead ruling 2026-09-28 07:10Z overrides the raw load-count rule here: both rows are
 * the same active man (owner's "DRIVER FROM LOADS" identifies WHICH MAN is active, not which UUID
 * of one man survives), and between two profiles of one man the survivor is the side carrying
 * POSTED MONEY (Samsara 60309682 + settlements 5775/5787 with posted JEs/escrow/payment state) —
 * fewest posted-money rows move. This is the ONE exception in this file and it carries an explicit
 * overrideReason; the guard below refuses every other survivor<loser pair without one.
 *
 * Retained from v4: escrow JEs posted through createJournalEntryOnClient + recordEscrowPostingOnly
 * (existing engine, never touch journal_entry_postings directly); one transaction, DRY_RUN rollback;
 * verify-owner-authorization before --apply; resolve tables/columns up front; open-settlement
 * conflict detection; post-merge zero-remaining-reference check.
 *
 * Changed from v4:
 *   - status='Inactive' on the loser, not 'Terminated' — the owner's rule is explicit: "ALL OTHER
 *     DRIVERS ARE INACTIVE." Terminated carries HR/employment semantics this is not.
 *   - mdata.drivers.merged_into_driver_id (new column, migration 202614420000) is set on the loser,
 *     pointing at the survivor — the order's "merged_into pointer" didn't exist as a column; this is
 *     the additive fix, alongside the existing audit.audit_events trail.
 *   - LOAD-COUNT GUARD: before repointing, measures live load count for both sides. If the survivor
 *     has fewer loads than the loser, the pair MUST carry a non-empty overrideReason or the whole run
 *     throws. This is the guard the Lead ordered so the next seat that runs this tool cannot repeat
 *     v4's reversal.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // owner
const LABEL = "merge-driver-r155-cleanup";
const MEMO_TAG = "ROUND 155.2 DRIVER CLEANUP";

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

type Pair = {
  survivor: string;
  loser: string;
  firstName: string;
  lastName: string;
  note: string;
  overrideReason?: string;
};

// Verified live 2026-09-28 05:07Z UTC (mdata.loads assigned_primary/secondary/accepted_by):
const PAIRS: Pair[] = [
  {
    survivor: "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
    loser: "6be5233e-3dd8-450e-b1a5-8e255be35960",
    firstName: "Hugo",
    lastName: "Gaytan Sarabia",
    note: "HUGO GAYTAN SARABIA (1/2): survivor 3445cf68 8 loads vs leftover 0-load duplicate 6be5233e sharing CDL DF01139352 with the already-merged loser 48d1da9e.",
  },
  {
    survivor: "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
    loser: "6c43e5d3-9a7e-4c10-b64b-2e65105cff34",
    firstName: "Hugo",
    lastName: "Gaytan Sarabia",
    note: "HUGO GAYTAN SARABIA (2/2): survivor 3445cf68 8 loads vs leftover 0-load duplicate 6c43e5d3 sharing the survivor's OWN Samsara id 60526640.",
  },
  {
    survivor: "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
    loser: "bd56ad0d-7eb4-4823-b8c7-8581c2593f14",
    firstName: "Genaro",
    lastName: "Guerrero Chavez",
    note: "GENARO GUERRERO CHAVEZ: survivor 6edcb351 13 loads, CDL HG0025561 vs leftover 0-load duplicate bd56ad0d sharing the SAME CDL HG0025561 and the already-merged loser's Samsara id 56507640.",
  },
  {
    survivor: "e3ac0879-8558-4c01-922f-0cc2d94b937b",
    loser: "ba4a00e9-7d1e-4ad3-abbf-416da08db0a3",
    firstName: "Eduardo Azael",
    lastName: "Flores Ortiz",
    note: "EDUARDO AZAEL FLORES ORTIZ: no load-count signal exists (both USMCA profiles currently 0 loads, about to receive their first via ROUND 155.2) — survivor chosen by hard identifier: e3ac0879 carries Samsara 58260285, loser ba4a00e9 carries none.",
    overrideReason:
      "0 loads on both sides, so the load-count guard cannot compare — survivor is the profile with a " +
      "real hard identifier (Samsara 58260285) already attached, per the same hard-identifier-wins " +
      "principle used throughout ROUND 148. A separate row for this same name under a DIFFERENT " +
      "operating_company_id (645bdb6b, TRANSPORTATION 91e0bf0a) exists but is out of scope — cross-entity, " +
      "never touched.",
  },
];

const FK_TABLES = [
  { table: "mdata.loads", column: "assigned_primary_driver_id" },
  { table: "mdata.loads", column: "assigned_secondary_driver_id" },
  { table: "mdata.loads", column: "accepted_by_driver_id" },
  { table: "driver_finance.driver_bills", column: "driver_id" },
  { table: "driver_finance.driver_bills", column: "team_driver_id" },
  { table: "driver_finance.driver_settlements", column: "driver_id" },
  // driver_finance.driver_advance_accounts is PK'd on (operating_company_id, driver_id) — a 1:1
  // config mapping (driver -> their advance-account GL account), not a transaction. Live-verified
  // 2026-09-28: a naive repoint crashes with a duplicate-key error whenever the survivor already
  // has its own row (LEONEL pair: survivor 5dd518ff had 2100-00-040, loser ac9ea24d had
  // 2100-00-003). Deliberately excluded: the loser's row is superseded, not deleted, by the
  // survivor's own pre-existing mapping, and remains discoverable via
  // mdata.drivers.merged_into_driver_id if anyone needs to trace it.
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

async function resolveTables(client: pg.PoolClient): Promise<Map<string, boolean>> {
  const resolved = new Map<string, boolean>();
  const permissionGaps: string[] = [];
  for (const fk of FK_TABLES) {
    const key = `${fk.table}.${fk.column}`;
    const res = await client.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
         ) AS column_exists,
         has_table_privilege(current_user, $1 || '.' || $2, 'UPDATE') AS can_update`,
      [fk.table.split(".")[0], fk.table.split(".")[1], fk.column],
    );
    const columnExists = res.rows[0].column_exists;
    const canUpdate = res.rows[0].can_update;
    const usable = columnExists && canUpdate;
    resolved.set(key, usable);
    if (!columnExists) console.log(`  [RESOLVE] SKIP ${key} — column does not exist`);
    else if (!canUpdate) {
      console.log(`  [RESOLVE] SKIP ${key} — current_user lacks UPDATE privilege (pre-existing RBAC gap, not this merge's to fix)`);
      permissionGaps.push(key);
    }
  }
  if (permissionGaps.length > 0) {
    console.log("");
    console.log(`  [RESOLVE] ${permissionGaps.length} table(s) skipped for missing UPDATE privilege: ${permissionGaps.join(", ")}`);
    console.log(`  [RESOLVE] row counts for all 7 losers on each skipped table must be checked separately before --apply.`);
  }
  return resolved;
}

async function liveLoadCount(client: pg.PoolClient, driverId: string): Promise<number> {
  const res = await client.query(
    `SELECT count(*)::int AS cnt FROM mdata.loads
      WHERE assigned_primary_driver_id = $1::uuid OR assigned_secondary_driver_id = $1::uuid OR accepted_by_driver_id = $1::uuid`,
    [driverId],
  );
  return res.rows[0].cnt;
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

    console.log(`${LABEL}: ${DRY ? "DRY RUN" : "APPLY"} — ${PAIRS.length} pairs, USMCA only`);
    console.log(`  actor_user_uuid: ${ACTOR_USER_ID}`);
    console.log("");

    console.log("=== RESOLVING TABLES/COLUMNS ===");
    const resolved = await resolveTables(client);
    console.log(`  ${resolved.size} entries, ${Array.from(resolved.values()).filter((v) => v).length} exist`);
    console.log("");

    for (const pair of PAIRS) {
      console.log("=".repeat(80));
      console.log(`  PAIR: ${pair.note}`);
      console.log("=".repeat(80));

      // LOAD-COUNT GUARD — the entire reason this file exists.
      const survivorLoads = await liveLoadCount(client, pair.survivor);
      const loserLoads = await liveLoadCount(client, pair.loser);
      console.log(`  LOAD-COUNT GUARD: survivor ${pair.survivor} = ${survivorLoads} loads, loser ${pair.loser} = ${loserLoads} loads`);
      if (survivorLoads < loserLoads) {
        if (!pair.overrideReason || pair.overrideReason.trim().length === 0) {
          throw new Error(
            `LOAD-COUNT GUARD FAILED: survivor ${pair.survivor} has ${survivorLoads} loads, fewer than loser ` +
              `${pair.loser}'s ${loserLoads} loads, and no overrideReason is present on this pair. This is the exact ` +
              `reversal bug found in merge-driver-v4 — refusing. If this direction is truly intended, add an ` +
              `overrideReason citing the specific evidence and re-run.`,
          );
        }
        console.log(`  LOAD-COUNT GUARD: survivor < loser, but overrideReason present — PROCEEDING under documented exception:`);
        console.log(`    ${pair.overrideReason}`);
      } else {
        console.log(`  LOAD-COUNT GUARD: PASS (survivor >= loser)`);
      }
      console.log("");

      await mergeDriver(client, pair, resolved, createJournalEntryOnClient, recordEscrowPostingOnly);
      console.log("");
    }

    console.log("=".repeat(80));
    console.log("  ESCROW RECONCILIATION (inside transaction, all USMCA drivers)");
    console.log("=".repeat(80));
    const escrowResult = await verifyEscrowReconciles(client);
    console.log(`  escrow-balance-reconciles-gl: ${escrowResult.pass ? "PASS" : "FAIL"} (${escrowResult.details.length} accounts)`);
    for (const r of escrowResult.details) {
      console.log(`    ${r.driver_id}: GL $${(r.gl_balance_cents / 100).toFixed(2)} vs projection $${(r.projection_balance_cents / 100).toFixed(2)} ${r.match ? "MATCH" : "MISMATCH"}`);
    }
    if (!escrowResult.pass) throw new Error(`escrow reconciliation FAILED — ${escrowResult.details.filter((d) => !d.match).length} mismatches`);

    console.log("");
    console.log("  JE BALANCE PROOF (all JEs in this transaction)");
    const jeBalanceRes = await client.query(
      `SELECT je.id::text, je.memo,
              COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0) AS debits,
              COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0) AS credits
       FROM accounting.journal_entries je
       LEFT JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
       WHERE je.memo LIKE $1
       GROUP BY je.id, je.memo
       ORDER BY je.id`,
      [`%${MEMO_TAG}%`],
    );
    let allBalanced = true;
    for (const je of jeBalanceRes.rows) {
      const debits = Number(je.debits);
      const credits = Number(je.credits);
      const balanced = debits === credits;
      if (!balanced) allBalanced = false;
      console.log(`    JE ${je.id}: debits=$${(debits / 100).toFixed(2)} credits=$${(credits / 100).toFixed(2)} ${balanced ? "BALANCED" : "NOT BALANCED"}`);
    }
    if (!allBalanced) throw new Error("JE balance proof FAILED — at least one JE is not balanced");
    console.log(`  JE balance proof: ${allBalanced ? "PASS" : "FAIL"} (${jeBalanceRes.rows.length} JEs)`);

    console.log("");
    console.log("  SAMSARA ROW COUNT (must be unchanged — never drop a row)");
    const samsaraCount = await client.query(`SELECT count(*)::int AS cnt FROM mdata.driver_samsara_accounts`);
    console.log(`    mdata.driver_samsara_accounts total: ${samsaraCount.rows[0].cnt}`);

    if (DRY) {
      console.log("");
      console.log("  DRY RUN — rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("");
      console.log(`  COMMITTED — all ${PAIRS.length} pairs merged successfully`);
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
  pair: Pair,
  resolved: Map<string, boolean>,
  createJournalEntryOnClient: any,
  recordEscrowPostingOnly: any,
) {
  const { survivor: survivorId, loser: loserId, firstName, lastName } = pair;

  const survivorRes = await client.query(`SELECT id::text, first_name, last_name, status FROM mdata.drivers WHERE id = $1::uuid`, [survivorId]);
  const loserRes = await client.query(`SELECT id::text, first_name, last_name, status FROM mdata.drivers WHERE id = $1::uuid`, [loserId]);
  if (survivorRes.rows.length === 0 || loserRes.rows.length === 0) {
    throw new Error(`survivor or loser not found: survivor=${survivorId}, loser=${loserId}`);
  }
  const survivor = survivorRes.rows[0];
  const loser = loserRes.rows[0];
  const fullName = `${firstName} ${lastName}`;

  console.log(`  Survivor: ${survivor.id} "${survivor.first_name} ${survivor.last_name}" (${survivor.status})`);
  console.log(`  Loser:    ${loser.id} "${loser.first_name} ${loser.last_name}" (${loser.status})`);
  console.log(`  Rename survivor to: "${fullName}"`);
  console.log("");

  console.log("  OPEN SETTLEMENT CHECK:");
  const survivorOpen = await client.query(
    `SELECT id::text, status, source_document_ref FROM driver_finance.driver_settlements WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'open'`,
    [survivorId, USMCA],
  );
  const loserOpen = await client.query(
    `SELECT id::text, status, source_document_ref FROM driver_finance.driver_settlements WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'open'`,
    [loserId, USMCA],
  );
  console.log(`    Survivor open settlements: ${survivorOpen.rows.length}, Loser open settlements: ${loserOpen.rows.length}`);
  if (survivorOpen.rows.length > 0 && loserOpen.rows.length > 0) {
    throw new Error(`OPEN SETTLEMENT CONFLICT: survivor ${survivorId} and loser ${loserId} both have open settlements — close loser's first.`);
  }
  console.log(`  Open settlement check: PASS`);
  console.log("");

  console.log("  FK REFERENCE COUNTS (before):");
  let totalRepoints = 0;
  for (const fk of FK_TABLES) {
    const key = `${fk.table}.${fk.column}`;
    if (!resolved.get(key)) continue;
    const res = await client.query(`SELECT count(*)::int AS cnt FROM ${fk.table} WHERE ${fk.column} = $1::uuid`, [loserId]);
    const count = res.rows[0].cnt;
    if (count > 0) {
      console.log(`    ${fk.table}.${fk.column}: ${count}`);
      totalRepoints += count;
    }
  }
  console.log(`  TOTAL FK references to loser: ${totalRepoints}`);
  console.log("");

  console.log("  ESCROW BALANCE TRANSFER:");
  const loserEscrowBalRes = await client.query(
    `SELECT current_balance_cents FROM driver_finance.escrow_balances WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid`,
    [loserId, USMCA],
  );
  const loserEscrowAcctRes = await client.query(
    `SELECT ea.id::text, ea.coa_account_id::text, a.account_name, a.account_number, ea.balance_cents::bigint
     FROM accounting.escrow_accounts ea JOIN catalogs.accounts a ON a.id = ea.coa_account_id
     WHERE ea.holder_id = $1::uuid AND ea.operating_company_id = $2::uuid AND ea.status = 'active' AND ea.holder_type = 'driver'`,
    [loserId, USMCA],
  );
  const survivorEscrowAcctRes = await client.query(
    `SELECT ea.id::text, ea.coa_account_id::text, a.account_name, a.account_number, ea.balance_cents::bigint
     FROM accounting.escrow_accounts ea JOIN catalogs.accounts a ON a.id = ea.coa_account_id
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

    if (loserAcct.coa_account_id === survivorAcct.coa_account_id) {
      console.log(`    SAME GL account ${loserAcct.account_number} — no JE needed`);
      const totalBalance = Number(loserAcct.balance_cents) + Number(survivorAcct.balance_cents);
      console.log(`    Survivor escrow_account.balance_cents AFTER: $${(totalBalance / 100).toFixed(2)}`);
    } else if (loserBalance > 0) {
      console.log(`    Posting JE: Dr ${loserAcct.account_number} $${(loserBalance / 100).toFixed(2)} / Cr ${survivorAcct.account_number} $${(loserBalance / 100).toFixed(2)}`);
      const je = await createJournalEntryOnClient(
        client,
        {
          operating_company_id: USMCA,
          entry_date: new Date().toISOString().slice(0, 10),
          memo: `${MEMO_TAG} escrow transfer: Dr ${loserAcct.account_number} / Cr ${survivorAcct.account_number} — driver merge ${loserId} -> ${survivorId} (${fullName})`,
          source: "manual",
          postings: [
            { account_id: loserAcct.coa_account_id, debit_or_credit: "debit", amount_cents: loserBalance, description: `Escrow transfer release — ${loser.first_name} ${loser.last_name} -> ${fullName}` },
            { account_id: survivorAcct.coa_account_id, debit_or_credit: "credit", amount_cents: loserBalance, description: `Escrow transfer deposit — ${fullName} (from ${loser.first_name} ${loser.last_name})` },
          ],
        },
        { userId: ACTOR_USER_ID, role: "Owner" },
      );
      console.log(`    JE posted: ${je.id}`);

      await recordEscrowPostingOnly(client, {
        operating_company_id: USMCA, driver_id: loserId, posting_type: "release", amount_cents: loserBalance,
        source_type: "manual", source_id: survivorId, note: `Escrow transfer to ${fullName} (${survivorId}) — driver merge`,
        posted_by_user_id: ACTOR_USER_ID, linked_journal_entry_id: je.id,
      });
      await recordEscrowPostingOnly(client, {
        operating_company_id: USMCA, driver_id: survivorId, posting_type: "deposit", amount_cents: loserBalance,
        source_type: "manual", source_id: loserId, note: `Escrow transfer from ${loser.first_name} ${loser.last_name} (${loserId}) — driver merge`,
        posted_by_user_id: ACTOR_USER_ID, linked_journal_entry_id: je.id,
      });
      console.log(`    Escrow postings recorded (release + deposit)`);

      await client.query(
        `UPDATE driver_finance.escrow_balances SET current_balance_cents = current_balance_cents - $1, total_released_cents = total_released_cents + $1, last_updated_at = now()
         WHERE driver_id = $2::uuid AND operating_company_id = $3::uuid`,
        [loserBalance, loserId, USMCA],
      );
      const survivorEscrowBalRes = await client.query(`SELECT id::text FROM driver_finance.escrow_balances WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid`, [survivorId, USMCA]);
      if (survivorEscrowBalRes.rows.length > 0) {
        await client.query(
          `UPDATE driver_finance.escrow_balances SET current_balance_cents = current_balance_cents + $1, total_held_cents = total_held_cents + $1, last_updated_at = now()
           WHERE driver_id = $2::uuid AND operating_company_id = $3::uuid`,
          [loserBalance, survivorId, USMCA],
        );
      } else {
        await client.query(
          `INSERT INTO driver_finance.escrow_balances (operating_company_id, driver_id, total_held_cents, total_released_cents, current_balance_cents, status, created_at, last_updated_at)
           VALUES ($1::uuid, $2::uuid, $3, 0, $3, 'active', now(), now())`,
          [USMCA, survivorId, loserBalance],
        );
      }
      console.log(`    driver_finance.escrow_balances updated (loser -$${(loserBalance / 100).toFixed(2)}, survivor +$${(loserBalance / 100).toFixed(2)})`);
    } else {
      console.log(`    Loser escrow balance is $0.00 — no JE needed`);
    }
  } else {
    console.log(`    No active escrow accounts on both sides — no JE needed`);
  }
  console.log("");

  console.log("  CLOSE LOSER ESCROW ACCOUNT:");
  if (loserEscrowAcctRes.rows.length > 0) {
    const loserAcct = loserEscrowAcctRes.rows[0];
    await client.query(`UPDATE accounting.escrow_accounts SET status = 'closed', updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [loserAcct.id, USMCA]);
    console.log(`    CLOSED escrow_account ${loserAcct.id} (${loserAcct.account_number})`);
    await client.query(
      `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
       VALUES ('driver_merge', 'info', $1, $2::uuid, 'MERGE-DRIVER-V5')`,
      [JSON.stringify({ action: "close_loser_escrow_account", escrow_account_id: loserAcct.id, account_number: loserAcct.account_number, loser_id: loserId, survivor_id: survivorId }), ACTOR_USER_ID],
    );
  } else {
    console.log(`    No loser escrow account to close`);
  }
  console.log("");

  console.log("  SAMSARA MAP:");
  const loserSamsaraRes = await client.query(`SELECT samsara_driver_id FROM mdata.driver_samsara_accounts WHERE driver_id = $1::uuid AND is_active = true`, [loserId]);
  console.log(`    Loser has ${loserSamsaraRes.rows.length} Samsara id(s): ${loserSamsaraRes.rows.map((r: any) => r.samsara_driver_id).join(", ") || "(none)"}`);
  if (loserSamsaraRes.rows.length > 0) {
    const moveRes = await client.query(`UPDATE mdata.driver_samsara_accounts SET driver_id = $1::uuid, updated_at = now() WHERE driver_id = $2::uuid AND is_active = true`, [survivorId, loserId]);
    console.log(`    MOVED ${moveRes.rowCount} Samsara id(s) from loser to survivor`);
    await client.query(
      `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source) VALUES ('driver_merge', 'info', $1, $2::uuid, 'MERGE-DRIVER-V5')`,
      [JSON.stringify({ action: "move_samsara_ids", survivor_id: survivorId, loser_id: loserId, moved_count: moveRes.rowCount }), ACTOR_USER_ID],
    );
  }
  console.log("");

  console.log("  REPOINTING FKs:");
  for (const fk of FK_TABLES) {
    const key = `${fk.table}.${fk.column}`;
    if (!resolved.get(key)) continue;
    const res = await client.query(`UPDATE ${fk.table} SET ${fk.column} = $1::uuid WHERE ${fk.column} = $2::uuid`, [survivorId, loserId]);
    const count = res.rowCount || 0;
    if (count > 0) {
      console.log(`    ${fk.table}.${fk.column}: ${count} row(s) -> ${survivorId}`);
      await client.query(
        `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source) VALUES ('driver_merge', 'info', $1, $2::uuid, 'MERGE-DRIVER-V5')`,
        [JSON.stringify({ table: fk.table, column: fk.column, survivor_id: survivorId, loser_id: loserId, repointed_count: count }), ACTOR_USER_ID],
      );
    }
  }
  console.log("");

  console.log("  RENAME SURVIVOR:");
  console.log(`    "${survivor.first_name} ${survivor.last_name}" -> "${fullName}"`);
  await client.query(`UPDATE mdata.drivers SET first_name = $1, last_name = $2 WHERE id = $3::uuid`, [firstName, lastName, survivorId]);

  // A survivor carries the loads (or, per an explicit override, posted money) — it can never remain
  // Inactive. Order §3: "Load-carrying drivers currently marked Inactive (status must follow the
  // loads)". Live-verified 2026-09-28: ALFONSO's survivor 40823a77 was status=Inactive pre-merge.
  if (survivor.status === "Inactive") {
    await client.query(`UPDATE mdata.drivers SET status = 'Active', deactivated_at = NULL WHERE id = $1::uuid`, [survivorId]);
    console.log(`    Survivor was status=Inactive pre-merge -> corrected to Active (a survivor cannot remain Inactive)`);
  }

  // Loser retired to Inactive with a durable merged_into pointer — never Terminated, never deleted.
  await client.query(
    `UPDATE mdata.drivers SET deactivated_at = now(), status = 'Inactive', merged_into_driver_id = $1::uuid WHERE id = $2::uuid`,
    [survivorId, loserId],
  );
  console.log(`    Retired loser: ${loser.id} "${loser.first_name} ${loser.last_name}" -> status=Inactive, merged_into_driver_id=${survivorId}`);

  await client.query(
    `INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source) VALUES ('driver_merge', 'info', $1, $2::uuid, 'MERGE-DRIVER-V5')`,
    [JSON.stringify({ action: "merge_complete", survivor_id: survivorId, loser_id: loserId, survivor_name: fullName, loser_name: `${loser.first_name} ${loser.last_name}`, override_reason: pair.overrideReason ?? null }), ACTOR_USER_ID],
  );

  console.log("");
  console.log("  POST-MERGE LOSER REFERENCE CHECK:");
  let remainingRefs = 0;
  const remainingDetails: string[] = [];
  for (const fk of FK_TABLES) {
    const key = `${fk.table}.${fk.column}`;
    if (!resolved.get(key)) continue;
    const res = await client.query(`SELECT count(*)::int AS cnt FROM ${fk.table} WHERE ${fk.column} = $1::uuid`, [loserId]);
    const count = res.rows[0].cnt;
    if (count > 0) {
      remainingRefs += count;
      remainingDetails.push(`${fk.table}.${fk.column}: ${count}`);
    }
  }
  const loserActiveEscrowRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.escrow_accounts WHERE holder_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'active'`,
    [loserId, USMCA],
  );
  if (loserActiveEscrowRes.rows[0].cnt > 0) {
    remainingRefs += loserActiveEscrowRes.rows[0].cnt;
    remainingDetails.push(`accounting.escrow_accounts.holder_id (active): ${loserActiveEscrowRes.rows[0].cnt}`);
  }
  console.log(`    Remaining loser references: ${remainingRefs}`);
  for (const d of remainingDetails) console.log(`      ${d}`);
  if (remainingRefs > 0) throw new Error(`loser ${loserId} still has ${remainingRefs} live references — merge incomplete`);
  console.log(`    Loser reference check: PASS (0 refs)`);

  console.log("");
  console.log("  SURVIVOR ESCROW ACCOUNT CHECK:");
  const survivorEscrowCountRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.escrow_accounts WHERE holder_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'active' AND holder_type = 'driver'`,
    [survivorId, USMCA],
  );
  console.log(`    Survivor active escrow_accounts: ${survivorEscrowCountRes.rows[0].cnt} (must be <= 1)`);
  if (survivorEscrowCountRes.rows[0].cnt > 1) {
    throw new Error(`survivor ${survivorId} has ${survivorEscrowCountRes.rows[0].cnt} active escrow_accounts (expected at most 1)`);
  }
  console.log(`    Survivor escrow check: PASS`);
}

async function verifyEscrowReconciles(client: pg.PoolClient) {
  const res = await client.query(
    `SELECT ea.holder_id::text AS driver_id, ea.balance_cents::bigint AS gl_balance_cents, COALESCE(eb.current_balance_cents, 0)::bigint AS projection_balance_cents
     FROM accounting.escrow_accounts ea
     LEFT JOIN driver_finance.escrow_balances eb ON eb.operating_company_id = ea.operating_company_id AND eb.driver_id = ea.holder_id
     WHERE ea.operating_company_id = $1::uuid AND ea.holder_type = 'driver' AND ea.status = 'active'`,
    [USMCA],
  );
  const details = res.rows.map((r: any) => ({
    driver_id: r.driver_id,
    gl_balance_cents: Number(r.gl_balance_cents),
    projection_balance_cents: Number(r.projection_balance_cents),
    match: Number(r.gl_balance_cents) === Number(r.projection_balance_cents),
  }));
  return { pass: details.every((d: any) => d.match), details };
}

main();

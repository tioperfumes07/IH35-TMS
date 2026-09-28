/**
 * E10 PHASE 5 — FUEL. The half-million-dollar block runner 01 names and stops on.
 *
 * Runner 01 ends its fuel phase with, verbatim:
 *   "FUEL TRANSACTIONS -- NO REVERSAL PATH EXISTS ANYWHERE IN THIS CODEBASE.
 *    Live posted GL legs: 1170 / $501511.22. STOP AND REPORT -- not voided, no 7th engine."
 * That was true when it was written and CC-3 was right to stop rather than invent an engine.
 * It is no longer true, and this file is why.
 *
 * WHY THERE WAS NO PATH — ONE LAYER LOWER THAN "NO ENGINE".
 * Measured live on production 2026-09-23: all 627 USMCA fuel transactions have ZERO linked
 * accounting.expenses rows and ZERO linked driver_settlement_deductions. Fuel posts to the
 * general ledger with NO DOCUMENT BEHIND IT. Nothing could reverse it because there was nothing
 * to void — not because an engine was missing. 'fuel_event' is absent from PostingSourceType and
 * from VoidableEntityType for the same reason: it is not a document type, it is a source record.
 *
 * SO THIS IS STILL NOT A SEVENTH ENGINE.
 * The journal entry a fuel purchase produced is an ordinary accounting.journal_entries row, and
 * engines #5/#6 (voidJournalEntry / reverseJournalEntryNoFlip) accept ANY posted journal entry
 * id by design. Runner 01 already uses exactly this for revrec 'earn' latches, whose
 * source_transaction_type='load' is likewise absent from PostingSourceType. Same engine, same
 * pattern, resolved by id instead of by typed dispatch. Nothing here writes new GL math.
 *
 * HOW THE JOURNAL ENTRY IS FOUND — A LINK THAT ALREADY EXISTED AND NOBODY USED.
 * accounting.transaction_source_links carries linked_object_type='fuel_event' with
 * linked_object_id = the fuel transaction id, one 'fuel_expense' leg and one 'fuel_offset' leg
 * per posting (2,306 links live for USMCA). Walk it to journal_entry_postings.journal_entry_uuid.
 *
 * ONLY LIVE ENTRIES COUNT, AND THIS IS THE WHOLE ANSWER.
 * In a void-not-delete system the reversed row is STILL THERE. Counting every linked entry says
 * 372 of 627 fuel transactions have 2 or 3 journal entries — that is ghosts: 555 of those are
 * already reversed. With the five-column liveness test applied, measured live:
 *     585 fuel transactions have exactly ONE live journal entry
 *      42 have none  ($21,550.68 of purchases never posted -- a separate, real, reported gap)
 *       0 have more than one
 * So this runner reverses 585 entries, skips 42 by name, and refuses loudly if it ever finds a
 * fuel purchase with two LIVE entries, because that would be genuine double-posting.
 *
 * IT DOES NOT CREATE THE EXPENSE DOCUMENT. createExpenseFromFuelTransaction
 * (apps/backend/src/fuel/fuel-expense-document.service.ts) does that, and it ADOPTS this same
 * journal entry rather than posting a second one. Giving fuel its document and reversing fuel's
 * posting are two separate operations and are deliberately not fused here: the purge needs the
 * reversal, the feed needs the document, and a script that did both would be impossible to run
 * for one purpose without the other.
 *
 * PROVING GROUND ONLY. Same guard as runner 01: ROUND271_ALLOW_HOST must name the host, and the
 * production compute host is refused by name, unconditionally.
 *
 * USAGE
 *   DATABASE_URL=... ROUND271_ALLOW_HOST=<host-substring> npx tsx scripts/ops/e10-void-runner-02-fuel-usmca.ts
 *   ... --execute     to actually call the engine
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { reverseJournalEntryNoFlip } from "../../apps/backend/src/accounting/journal-entries.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = process.env.E10_ACTOR_USER_ID ?? "";
const VOID_REASON =
  "E10 mass void — fuel purchase posting reversed through engine #6 by journal entry id; " +
  "fuel is a source record, not a document type, so it is reached by id, not by typed dispatch";

type Row = { fuel_id: string; je_id: string; amount_cents: string; ref: string | null };

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (!process.env.ROUND271_ALLOW_HOST)
    throw new Error("ABORT: requires ROUND271_ALLOW_HOST naming the exact proving-ground host.");
  if (!url.includes(process.env.ROUND271_ALLOW_HOST))
    throw new Error("ABORT: DATABASE_URL host does not match ROUND271_ALLOW_HOST.");
  if (/ep-broad-block-akykk7bw/.test(url))
    throw new Error("ABORT: refusing the production compute host, by name, unconditionally.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);

  console.log(`DATABASE_URL host: ${new URL(url).host}`);
  console.log(executeFlag ? "MODE: --execute (will call engine #6)" : "MODE: dry-run (measurement only)");

  // ---- Every fuel purchase with its LIVE journal entries, one row per (fuel, live JE). -----
  const rows = await client.query<Row>(
    `SELECT f.id::text AS fuel_id,
            p.journal_entry_uuid::text AS je_id,
            sum(p.amount_cents)::text AS amount_cents,
            f.transaction_reference AS ref
       FROM fuel.fuel_transactions f
       JOIN accounting.transaction_source_links l
         ON l.linked_object_type = 'fuel_event'
        AND l.linked_object_id = f.id::text
        AND l.operating_company_id = f.operating_company_id
        AND l.relationship_role = 'fuel_expense'
       JOIN accounting.journal_entry_postings p ON p.id = l.journal_entry_posting_id
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE f.operating_company_id = $1::uuid
        AND f.archived_at IS NULL
        AND p.reversed_by_line_id IS NULL
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND je.reversed_by_je_id IS NULL
        AND je.reverses_je_id IS NULL
      GROUP BY f.id, p.journal_entry_uuid, f.transaction_reference`,
    [USMCA_COMPANY_ID],
  );

  // ---- A fuel purchase with TWO live entries is real double-posting. Refuse, never pick one. -
  const byFuel = new Map<string, Row[]>();
  for (const r of rows.rows) {
    const list = byFuel.get(r.fuel_id) ?? [];
    list.push(r);
    byFuel.set(r.fuel_id, list);
  }
  const doubled = [...byFuel.entries()].filter(([, v]) => v.length > 1);
  if (doubled.length) {
    console.error(`\nREFUSING: ${doubled.length} fuel purchase(s) carry MORE THAN ONE LIVE journal entry.`);
    console.error("That is the fuel posted twice and really on the books twice. It is an upstream");
    console.error("defect, not something this runner resolves by choosing one entry and hiding the other.");
    for (const [fuelId, v] of doubled.slice(0, 20))
      console.error(`  fuel ${fuelId}: ${v.map((x) => x.je_id).join(", ")}`);
    client.release();
    await pool.end();
    process.exit(1);
  }

  const total = rows.rows.reduce((a, r) => a + Number(r.amount_cents), 0);
  const unposted = await client.query<{ n: string; cents: string }>(
    `SELECT count(*)::text AS n, coalesce(round(sum(f.total_cost) * 100), 0)::text AS cents
       FROM fuel.fuel_transactions f
      WHERE f.operating_company_id = $1::uuid
        AND f.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM accounting.transaction_source_links l
            JOIN accounting.journal_entry_postings p ON p.id = l.journal_entry_posting_id
            JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
           WHERE l.linked_object_type = 'fuel_event' AND l.linked_object_id = f.id::text
             AND p.reversed_by_line_id IS NULL AND je.status = 'posted'
             AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL)`,
    [USMCA_COMPANY_ID],
  );

  console.log(`\nFuel purchases with exactly one LIVE posting: ${byFuel.size}`);
  console.log(`Live fuel expense to reverse: $${(total / 100).toFixed(2)}`);
  console.log(
    `Fuel purchases with NO live posting (named, not touched): ${unposted.rows[0]!.n} ` +
      `($${(Number(unposted.rows[0]!.cents) / 100).toFixed(2)} of purchases never posted)`,
  );

  if (!executeFlag) {
    console.log("\nDry run. Nothing called. Re-run with --execute.");
    client.release();
    await pool.end();
    return;
  }
  if (!OWNER_USER_ID) throw new Error("ABORT: --execute requires E10_ACTOR_USER_ID. A void must name a real actor.");

  let reversed = 0;
  const errors: string[] = [];
  for (const r of rows.rows) {
    try {
      await reverseJournalEntryNoFlip(client, {
        operatingCompanyId: USMCA_COMPANY_ID,
        journalEntryId: r.je_id,
        reason: VOID_REASON,
        actorUserId: OWNER_USER_ID,
      });
      reversed++;
    } catch (e) {
      errors.push(`fuel ${r.fuel_id} je ${r.je_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n=== FUEL SUMMARY ===`);
  console.log(`reversed=${reversed} errors=${errors.length} never_posted=${unposted.rows[0]!.n}`);
  for (const e of errors) console.log(`  ERROR: ${e}`);

  client.release();
  await pool.end();
  if (errors.length) process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

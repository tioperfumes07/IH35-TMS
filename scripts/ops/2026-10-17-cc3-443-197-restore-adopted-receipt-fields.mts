// LEAD 443.197 (17:45Z) item 2 — run AFTER 2026-10-17-cc3-443-197-dreamline-8-duplicates.mts.
//
// The 443.142 Dreamline statement import (2026-10-16 14:46Z) adopted Settlement Creator receipts with a stamp that ALSO
// overwrote each receipt's gross_cost / discount_amount with the CARD's figures (bd41d055ba #26780), while the card
// difference posted on its own (Dr 2510 / Cr Fuel Card Discount). 305 receipts then read total_cost <> gross_cost −
// discount_amount (verify-control-totals: "Active USMCA fuel rows carry no discount after the net migration"); the other
// 40 stamped receipts hold the card's gross too (gross = total, discount 0) — not the receipt's own values either.
// 443.197 makes the stamp marker-only; this runner gives every stamped receipt back its OWN pre-stamp gross / discount,
// read from audit.row_changes (old_data of the FIRST UPDATE that put a dreamline_efs marker on the row), through the
// narrow audited writer restoreDreamlineAdoptedReceiptAmounts (gross_cost / discount_amount only; never total_cost, a
// posting, a document or a note). Prod measure 2026-10-17: every pre-stamp value is gross NULL / discount 0.
//
// Moves NO money: the per-account trial balance after == before exactly (every delta 0), company TB 0. Card
// differences stay as posted. Refuses (nothing changes) on a stamped receipt with no audit stamp row, one whose
// total_cost moved since the stamp, or one whose restored pair breaks total = coalesce(gross, total) − discount.
// Read-back: control-totals' fuel-discount check = 0, no stamped receipt left off its pre-stamp values, the live
// Diesel document count unchanged (dedupe baseline 272).
//   default: dry run, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.197 (assertIsIntendedProduction)
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { restoreDreamlineAdoptedReceiptAmounts, type DreamlineReceiptAmountRestore } from "../../apps/backend/src/fuel/dreamline-receipt-amount-restore.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const AUTH = "LEAD-ORDER-443.197";
const REASON = "LEAD 443.197: the Dreamline adoption stamp overwrote this receipt's gross / discount with the statement card's — restored to the receipt's own pre-stamp values (audit.row_changes); the card difference stays as posted";

const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== AUTH) throw new Error(`--apply requires --auth ${AUTH}`);
  // verify-owner-authorization: Lead ruling 443.197 (17:45Z) — restore adopted receipts' own gross / discount, no posting moves, TB 0.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.197 restore adopted receipt fields" });
else if (FORK) await assertNotProduction(db, { label: "443.197 restore adopted receipt fields (fork)" });

const refuse = (why: string): never => { throw new Error(`NOT VERIFIED: ${why} — nothing changed`); };
const byAccount = async (): Promise<Record<string, number>> =>
  Object.fromEntries((await db.query(
    `SELECT account_id::text a, sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::text n
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid GROUP BY 1`, [USMCA])).rows.map((r: any) => [r.a, Number(r.n)]));
// verify-control-totals.mjs, "Active USMCA fuel rows carry no discount after the net migration" — the same predicate
const controlTotalsFuelDiscount = async () => Number((await db.query(
  `SELECT count(*)::int n FROM fuel.fuel_transactions ft
    WHERE ft.operating_company_id = $1::uuid AND ft.archived_at IS NULL
      AND round(ft.total_cost, 2) <> round(coalesce(ft.gross_cost, ft.total_cost) - coalesce(ft.discount_amount, 0), 2)`, [USMCA])).rows[0].n);
const liveDiesel = async () => Number((await db.query(
  `SELECT count(*)::int n FROM accounting.expenses e WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.memo ILIKE 'Diesel%'`, [USMCA])).rows[0].n);

// Every receipt the statement import stamped (not a row it wrote itself), its current amounts, and the pre-stamp
// values from the FIRST audit row that put a marker on it.
const POPULATION_SQL = `
  WITH first_stamp AS (
    SELECT DISTINCT ON (rc.row_pk) rc.row_pk, rc.changed_at, rc.old_data
      FROM audit.row_changes rc
     WHERE rc.schema_name = 'fuel' AND rc.table_name = 'fuel_transactions' AND rc.op = 'UPDATE'
       AND coalesce(rc.new_data->>'notes', '') LIKE '%dreamline_efs=%'
       AND coalesce(rc.old_data->>'notes', '') NOT LIKE '%dreamline_efs=%'
     ORDER BY rc.row_pk, rc.changed_at, rc.id)
  SELECT ft.id::text, ft.total_cost::text AS total, ft.gross_cost::text AS gross, ft.discount_amount::text AS disc,
         ft.voided_at IS NOT NULL AS voided, coalesce(ft.notes, '') LIKE '%dreamline_efs=%' AS marked,
         fs.row_pk IS NOT NULL AS has_stamp, fs.changed_at::text AS stamped_at,
         fs.old_data->>'total_cost' AS pre_total, fs.old_data->>'gross_cost' AS pre_gross, fs.old_data->>'discount_amount' AS pre_disc
    FROM fuel.fuel_transactions ft
    LEFT JOIN first_stamp fs ON fs.row_pk = ft.id::text
   WHERE ft.operating_company_id = $1::uuid AND ft.archived_at IS NULL
     AND coalesce(ft.notes, '') NOT LIKE '%443.142 Dreamline statement%'
     AND (coalesce(ft.notes, '') LIKE '%dreamline_efs=%' OR fs.row_pk IS NOT NULL)
   ORDER BY ft.id`;
type Pop = { id: string; total: string; gross: string | null; disc: string | null; voided: boolean; marked: boolean; has_stamp: boolean; stamped_at: string | null; pre_total: string | null; pre_gross: string | null; pre_disc: string | null };
const c = (v: string | null | undefined) => (v === null || v === undefined ? null : Math.round(Number(v) * 100));

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const before = await byAccount();
  const ctBefore = await controlTotalsFuelDiscount();
  const dieselBefore = await liveDiesel();

  const pop = (await db.query(POPULATION_SQL, [USMCA])).rows as Pop[];
  const noAudit = pop.filter((r) => r.marked && !r.has_stamp).map((r) => r.id);
  if (noAudit.length) refuse(`${noAudit.length} stamped receipts have no audit stamp row (pre-stamp values not in the DB): ${noAudit.join(", ")}`);
  const moved = pop.filter((r) => r.has_stamp && c(r.pre_total) !== c(r.total)).map((r) => r.id);
  if (moved.length) refuse(`${moved.length} receipts' total_cost moved since the stamp (pre-stamp values ambiguous): ${moved.join(", ")}`);
  const differs = (r: Pop) => c(r.gross) !== c(r.pre_gross) || (c(r.disc) ?? 0) !== (c(r.pre_disc) ?? 0);
  const toRestore = pop.filter((r) => r.has_stamp && !r.voided && differs(r));
  // a row that lost its marker (a released wrong line) but still holds the line's amounts: the writer only writes
  // adopted receipts — listed, refused
  const unmarked = toRestore.filter((r) => !r.marked).map((r) => r.id);
  if (unmarked.length) refuse(`${unmarked.length} un-adopted receipts still hold a statement line's amounts: ${unmarked.join(", ")}`);
  const violating = toRestore.filter((r) => c(r.total) !== (c(r.gross) ?? c(r.total))! - (c(r.disc) ?? 0)).length;
  const restores: DreamlineReceiptAmountRestore[] = toRestore.map((r) => ({ fuel_transaction_id: r.id, gross_cost: r.pre_gross, discount_amount: r.pre_disc ?? "0" }));
  const preShape = new Map<string, number>();
  for (const r of toRestore) {
    const k = `gross ${r.pre_gross === null ? "NULL" : "set"} / discount ${(c(r.pre_disc) ?? 0) === 0 ? "0" : "set"}`;
    preShape.set(k, (preShape.get(k) ?? 0) + 1);
  }
  console.log(`population: ${pop.length} stamped receipts · to restore ${toRestore.length} (${violating} violating the fuel-discount check, ${toRestore.length - violating} holding the card's gross without a violation) · pre-stamp shapes ${JSON.stringify(Object.fromEntries(preShape))}`);

  const done = await restoreDreamlineAdoptedReceiptAmounts(db as never, { operatingCompanyId: USMCA, actorUserId: OWNER, reason: REASON, restores });

  // ── read-back ──
  const after = await byAccount();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const wrongDelta = [...keys].filter((k) => (after[k] ?? 0) !== (before[k] ?? 0));
  const tb = Object.values(after).reduce((s, v) => s + v, 0);
  const ctAfter = await controlTotalsFuelDiscount();
  const left = ((await db.query(POPULATION_SQL, [USMCA])).rows as Pop[]).filter((r) => r.has_stamp && !r.voided && differs(r)).length;
  const audited = Number((await db.query(
    `SELECT count(*)::int n FROM audit.row_changes WHERE schema_name='fuel' AND table_name='fuel_transactions' AND op='UPDATE'
       AND row_pk = ANY($1::text[]) AND changed_at >= now() - interval '1 hour'
       AND (old_data->>'gross_cost') IS DISTINCT FROM (new_data->>'gross_cost')`, [done.map((d) => d.fuel_transaction_id)])).rows[0].n);
  const dieselAfter = await liveDiesel();
  console.log(`restored ${done.length} · account deltas ${wrongDelta.length} (expected 0 — no posting moves) · company TB ${tb} · control-totals fuel discount ${ctBefore} -> ${ctAfter} · stamped receipts still off their own values ${left} · row-level audit rows ${audited} · live Diesel documents ${dieselBefore} -> ${dieselAfter} (dedupe baseline 272)`);
  if (wrongDelta.length || tb !== 0 || ctAfter !== 0 || left || done.length !== restores.length || audited < done.length || dieselAfter !== dieselBefore)
    throw new Error(`NOT VERIFIED: ${JSON.stringify({ wrongDelta, tb, ctAfter, left, done: done.length, restores: restores.length, audited, dieselBefore, dieselAfter })} — rolled back`);
  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await db.query("ROLLBACK");
    console.log(`DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth ${AUTH}.`);
  }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 2000);
}

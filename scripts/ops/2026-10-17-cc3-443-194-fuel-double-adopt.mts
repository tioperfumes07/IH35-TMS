// LEAD 443.194 (15:10Z #5 — "the Creator adopts the receipt's existing posting instead of posting a second fuel expense;
// prod measure + adopt via engine if any double exists, TB 0").
// Prod measure 2026-10-17 (read-only): 0 fuel receipts with two live postings under the ONE receipt identity
// (fuel.fuel_receipt_postings / fuel.fuel_receipt_key — the 268 receipts carrying two live entries are each a fill + its
// Dreamline card-discount pair (241) or a fill + its 443.192 load reclassification (27, every account net 0), not a second
// expense). ONE purchase is booked twice ACROSS two receipt identities: the Settlement Creator booked the Love's receipt
// (typed receipt number) on 2026-10-11; the Dreamline statement import (443.142, 2026-10-16) did not adopt it and imported
// the same purchase again under its EFS invoice (same truck, day, card rail, product, gallons, amount, load).
// Repair, through the engines only:
//   1. the statement copy's expense document is voided by the ONE expense void (voidExpenseDocumentInClientTx): its live
//      fuel_event entry is reversed by postVoidReversal (the receipt identity is released), the document stamped void;
//   2. the statement copy's fuel row is voided whole by the governance executor (executeVoidCancel 'fuel_transaction');
//   3. the statement line ADOPTS the booked receipt through the import's one adoption stamp (stampDreamlineReceiptAdopted:
//      marker + gross / discount), so a re-run of the statement reads it as already_imported and never re-imports it.
// One transaction: per-account trial balance after == before minus exactly the reversed copy's entry (every other delta 0),
// company TB 0; COMMIT only with --apply (or --fork-commit on a non-production branch); default = everything ROLLED BACK.
//   default: dry run · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.194
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { voidExpenseDocumentInClientTx } from "../../apps/backend/src/accounting/expense-void.service.ts";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.ts";
import { dreamlineAdoptMarker, stampDreamlineReceiptAdopted } from "../../apps/backend/src/fuel/dreamline-statement-import.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
// The measured pair (statement copy -> booked receipt it duplicates). The detection below must find exactly these.
const EXPECTED: Record<string, string> = { "716c5298-056d-4ae9-b355-ae9295c0a830": "787e6d50-af41-486f-832a-4f928d3e3651" };
// Dreamline item code by product for the adoption marker (this card's statement carries ULSD for diesel: its 08-20 fill
// adopted as dreamline_efs=…:ULSD:1). Any other product is refused, never guessed.
const ITEM_BY_FUEL_TYPE: Record<string, string> = { diesel: "ULSD" };
const REASON = "LEAD 443.194: the Dreamline statement imported a purchase already booked by the Settlement Creator (same truck, day, card, product, gallons, amount, load) — the statement line adopts the booked receipt";

const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.194") throw new Error("--apply requires --auth LEAD-ORDER-443.194");
  // verify-owner-authorization: Lead ruling 443.194 (15:10Z #5) — adopt via engine if any double exists, TB 0.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.194 fuel double adopt" });
else if (FORK) await assertNotProduction(db, { label: "443.194 fuel double adopt (fork)" });

const byAccount = async (): Promise<Record<string, number>> =>
  Object.fromEntries(
    (await db.query(`SELECT account_id::text a, sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::text n
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid GROUP BY 1`, [USMCA])).rows.map((r: any) => [r.a, Number(r.n)])
  );

/** A statement-imported fuel row whose purchase is ALREADY a live posted receipt under another identity. */
const DETECT_SQL = `
  WITH live AS (
    SELECT ft.id, ft.unit_id, ft.fuel_card_id, ft.fuel_type::text AS fuel_type, ft.gallons, ft.total_cost, ft.load_id, ft.notes,
           coalesce(ft.purchased_at, ft.transaction_at)::date AS d,
           fuel.fuel_row_receipt_key(ft.operating_company_id, ft.id) AS rk,
           e.id AS expense_id, e.journal_entry_id
      FROM fuel.fuel_transactions ft
      JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id AND e.operating_company_id = ft.operating_company_id
                                AND e.voided_at IS NULL AND e.posting_status = 'posted'
      JOIN accounting.journal_entries je ON je.id = e.journal_entry_id AND je.status = 'posted'
                                        AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
     WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL AND ft.archived_at IS NULL)
  SELECT s.id::text AS copy_id, s.expense_id::text AS copy_expense_id, s.journal_entry_id::text AS copy_je_id,
         substring(s.notes from 'efs_invoice=([^;\\s]+)') AS efs_invoice, s.fuel_type,
         b.id::text AS keep_id, b.expense_id::text AS keep_expense_id, b.journal_entry_id::text AS keep_je_id,
         round(s.total_cost * 100)::bigint AS copy_cents
    FROM live s
    JOIN live b ON b.id <> s.id AND b.unit_id = s.unit_id AND b.fuel_card_id IS NOT DISTINCT FROM s.fuel_card_id
               AND b.fuel_type = s.fuel_type AND b.d = s.d AND b.gallons = s.gallons AND abs(b.total_cost - s.total_cost) <= 0.01
               AND b.load_id IS NOT DISTINCT FROM s.load_id AND b.rk IS DISTINCT FROM s.rk
               AND coalesce(b.notes, '') NOT LIKE '%443.142 Dreamline statement%'
               AND coalesce(b.notes, '') NOT LIKE '%dreamline_efs=%'
   WHERE coalesce(s.notes, '') LIKE '%443.142 Dreamline statement%'
   ORDER BY s.id`;

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const before = await byAccount();

  const pairs = (await db.query(DETECT_SQL, [USMCA])).rows as any[];
  const found = Object.fromEntries(pairs.map((p) => [p.copy_id, p.keep_id]));
  if (JSON.stringify(Object.entries(found).sort()) !== JSON.stringify(Object.entries(EXPECTED).sort()))
    throw new Error(`NOT VERIFIED: detection found ${JSON.stringify(found)}, expected ${JSON.stringify(EXPECTED)} — nothing changed`);

  // What must leave the books: exactly the copy's live entry, per account (sign reversed by the void).
  const expectedDelta: Record<string, number> = {};
  for (const p of pairs) {
    const legs = await db.query(
      `SELECT account_id::text a, sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::bigint n
         FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid AND operating_company_id = $2::uuid GROUP BY 1`,
      [p.copy_je_id, USMCA]
    );
    for (const l of legs.rows as any[]) expectedDelta[l.a] = (expectedDelta[l.a] ?? 0) - Number(l.n);
  }

  for (const p of pairs) {
    const item = ITEM_BY_FUEL_TYPE[p.fuel_type];
    if (!item || !p.efs_invoice) throw new Error(`NOT VERIFIED: copy ${p.copy_id} has no Dreamline item / EFS invoice to adopt under — nothing changed`);
    const marker = dreamlineAdoptMarker({ efs_invoice: p.efs_invoice, item } as never, 1);
    const taken = await db.query(`SELECT count(*)::int n FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND voided_at IS NULL AND notes LIKE '%' || $2 || '%'`, [USMCA, marker]);
    if (Number(taken.rows[0].n) !== 0) throw new Error(`NOT VERIFIED: marker ${marker} already on a live row — nothing changed`);
    const copyRow = (await db.query(`SELECT round(coalesce(gross_cost, total_cost) * 100)::bigint g, round(coalesce(discount_amount, 0) * 100)::bigint dsc FROM fuel.fuel_transactions WHERE id=$1::uuid`, [p.copy_id])).rows[0] as any;

    const v = await voidExpenseDocumentInClientTx(db as never, { operatingCompanyId: USMCA, expenseId: p.copy_expense_id, actorUserId: OWNER, reason: REASON });
    if (!v.reversingJeId) throw new Error(`NOT VERIFIED: expense ${p.copy_expense_id} void produced no reversal`);
    const fx = await executeVoidCancel("fuel_transaction", { client: db as never, operatingCompanyId: USMCA, entityId: p.copy_id, action: "void", userId: OWNER, reason: REASON });
    if (fx.kind !== "ok") throw new Error(`NOT VERIFIED: fuel row ${p.copy_id} void returned ${fx.kind}`);
    await stampDreamlineReceiptAdopted(db as never, { companyId: USMCA, fuelTransactionId: p.keep_id, marker, grossCents: Number(copyRow.g), discountCents: Number(copyRow.dsc) });
    console.log(`  copy fuel row ${p.copy_id} (expense ${p.copy_expense_id}, entry ${p.copy_je_id}) voided — reversal ${v.reversingJeId}; line ${marker} adopts receipt ${p.keep_id} (expense ${p.keep_expense_id}, entry ${p.keep_je_id})`);
  }

  const after = await byAccount();
  const keys = new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(expectedDelta)]);
  const wrong = [...keys].filter((k) => (after[k] ?? 0) - (before[k] ?? 0) !== (expectedDelta[k] ?? 0));
  const tb = Object.values(after).reduce((s, n) => s + n, 0);
  const moved = Object.entries(expectedDelta).filter(([, n]) => n !== 0);
  const stillDouble = (await db.query(DETECT_SQL, [USMCA])).rows.length;
  const liveCopies = (await db.query(
    `SELECT count(*)::int n FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid
      WHERE p.operating_company_id=$1::uuid AND p.source_transaction_type='fuel_event' AND p.source_transaction_id = ANY($2::text[])
        AND je.status='posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`,
    [USMCA, Object.keys(EXPECTED)]
  )).rows[0].n;
  console.log(`pairs ${pairs.length} · accounts moved by the reversal ${moved.length} (${moved.map(([a, n]) => `${a}:${n}`).join(", ")}) · other deltas ${wrong.length} · company TB ${tb} · doubles after ${stillDouble} · live entries on the copies ${liveCopies}`);
  if (wrong.length || tb !== 0 || stillDouble !== 0 || Number(liveCopies) !== 0) throw new Error("NOT VERIFIED: a balance moved beyond the copy's entry, TB ≠ 0, or a double remains — rolled back");
  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await db.query("ROLLBACK");
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.194.");
  }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 2000);
}

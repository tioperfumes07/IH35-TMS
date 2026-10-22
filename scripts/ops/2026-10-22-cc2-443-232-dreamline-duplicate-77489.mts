// LEAD 443.232 b (CC-2) — verify-diesel-expense-fuel-dedupe: duplicate_fill_pairs 4 -> 6 after the 443.214 GPS apply. One of
// the two new pairs is a REAL double count the GPS move exposed: EFS 77489 (Dreamline import row 5198a23c, card coded T175,
// Mandeville LA 09-02 21:14 CT, 78.020 gal) is the same fill as the settlement receipt dbf57397 (T164, 66595 Wadsworth Pkwy
// Mandeville LA, 09-02, 78.016 gal). The import could not adopt the receipt (the card said T175); the fuel engine put the
// statement row on T164 by GPS, so both rows now sit on one truck. Same repair as 443.197 (this file is that script with
// one measured pair): the copy voided through the expense + fuel void engines, the import engine then adopts the receipt
// (marker + provider moment) and posts the card difference. The other new pair (c2ef82c1 / 5e4559ab) is NOT a duplicate:
// two different Dreamline fills of T171 (EFS 61620 08-03 12:50Z, EFS 81320 08-05 02:53Z) — the guard's ±1 day is too wide.
//
// --- original 443.197 header follows ---
// LEAD 443.197 (17:45Z) item 3(a) — the 8 leftover Dreamline statement-import duplicates, repaired like 443.196: every
// statement fact read from the DATABASE (the import's own statement rows, the markers + card facts it stamped, its
// card-difference entries) — never a file — and every write through an engine.
//
// Prod measure 2026-10-17 (read-only). Each copy is a live statement row the 443.142 import wrote (rail 2510, posted)
// for a fill that was ALREADY booked: the Creator receipt of the same truck, company day ±1, gallons within 0.01, and
// receipt total within 5 cents of the card gross.
//   copy      EFS          receipt   why the import did not adopt the receipt
//   59cd9bb5  66509 ULSD   8a433b38  receipt consumed without adoption (no marker on it)
//   c3ae71a2  99986 ULSD   9cc9fcbb  receipt consumed without adoption (no marker on it)
//   aa555dbf  73437 ULSD   cd535814  receipt adopted by the WRONG statement line 01439:ULSD:1
//   7694162e  99324 ULSD   19e9a778  receipt adopted by the WRONG statement line 20958:ULSD:1
//   81b85b66  04361 ULSD   83ef955d  receipt adopted by the WRONG statement line 26789:ULSD:1
//   81ef1ff0  67957 ULSD   0060f591  receipt adopted by the WRONG statement line 87578:ULSD:1
//   40679ead  42359 ULSD   00253ef9  receipt adopted by the WRONG statement line 40828:ULSD:1
//   5836599c  57658 ULSD   f15bc7c2  receipt adopted by the WRONG statement line 69505:ULSD:1
//
// Repair (one transaction):
//   1. each copy: its expense voided by the ONE expense void (voidExpenseDocumentInClientTx), its fuel row voided whole
//      (executeVoidCancel 'fuel_transaction') — the 443.194 / 443.196 calls;
//   2. each wrongly adopted receipt freed: the wrong line's card-difference entry (found by its idempotency key) reversed
//      by the governance JE executor (executeVoidCancel 'journal_entry'), its marker taken off
//      (unstampDreamlineReceiptAdopted — marker only since 443.197);
//   3. the IMPORT ENGINE itself (importDreamlineStatement, non-dry) runs on the 8 true lines, each built from its copy
//      row's own facts (efs_invoice / file_unit / card / time / gallons / gross / discount / net); it adopts each true
//      receipt (stamp = marker only) and posts each card difference through its own poster. Any other outcome refuses.
//   NOT repaired (refuse + list — owner re-import of the statement): the six released wrong lines. Five have no
//   statement row in the DB (unit / time / card absent): 01439, 20958, 40828, 69505, 87578 ULSD. 26789 ULSD has its
//   facts (sibling statement row 955c9423 of the same EFS invoice + the card gross / discount it stamped, tied by its
//   entry) but its own fill — the T171 08-20 receipt fc1ffb20 at the exact card gross — is held by marker
//   05708:ULSD:1, so the engine's same-truck pass would hand it 83ef955d (04361's receipt): not run, listed. Their old
//   card-difference idempotency keys stay used (unique index): the engine never re-posts them.
// Checks: per-account trial balance after == before + exactly (copies' entries reversed + 6 wrong entries reversed +
// the engine's card differences, all computed BEFORE any write), every other delta 0, company TB 0; read-back: each
// true marker on its true receipt only, no wrong marker left on its receipt, copies void, no live entry on a copy,
// wrong entries reversed, a DRY RUN of the import engine reads every repaired line as already_imported, the 8 pairs are
// no longer duplicate fills, and live Diesel documents = before − 8 (the dedupe guard's 272).
//   default: dry run, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.197 (assertIsIntendedProduction)
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { voidExpenseDocumentInClientTx } from "../../apps/backend/src/accounting/expense-void.service.ts";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.ts";
import {
  dreamlineAdoptionRefused,
  dreamlineProduct,
  importDreamlineStatement,
  unstampDreamlineReceiptAdopted,
  type DreamlineStatementLine,
} from "../../apps/backend/src/fuel/dreamline-statement-import.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const AUTH = "LEAD-ORDER-443.232";
const REASON = "LEAD 443.232 b (repair of 443.197 shape): the Dreamline statement import booked a copy of an already-booked fill (its receipt was consumed without adoption or adopted by another statement line) — copy voided, wrong card difference reversed, the line adopts its own receipt through the import engine";

// The measured rows. Every fact is READ from the DB and checked; these ids only name what was measured.
const PAIRS: Array<{ efs: string; copy: string; receipt: string; wrongMarker: string | null }> = [
  { efs: "77489", copy: "5198a23c-106e-4b82-a5ea-00d1b973e9b8", receipt: "dbf57397-1be3-43b5-a167-f71798c617d2", wrongMarker: null },
];
// The released wrong lines — NOT re-run (see header). Refuse if any of them has gained a statement row (re-measure).
const RELEASED_NOT_IN_DB = ["01439", "20958", "40828", "69505", "87578"];
const RELEASED_RECEIPT_HELD = { efs: "26789", sibling: "955c9423-5e77-4291-b808-2f75d9eb850e", ownReceipt: "fc1ffb20-8efa-483e-8b2d-ff6c4a0cff58", heldBy: "dreamline_efs=05708:ULSD:1" };
const ITEM_OF: Record<string, string> = { diesel: "ULSD", reefer_diesel: "ULSR", def: "DEFD" };

const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== AUTH) throw new Error(`--apply requires --auth ${AUTH}`);
  // verify-owner-authorization: Lead 443.232 b (10-22 14:40Z) — "if yes fix through the engine (fork, TB 0)": one Dreamline duplicate exposed by the 443.214 GPS apply.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.232 dreamline duplicate 77489" });
else if (FORK) await assertNotProduction(db, { label: "443.232 dreamline duplicate 77489 (fork)" });

const refuse = (why: string): never => { throw new Error(`NOT VERIFIED: ${why} — nothing changed`); };
const byAccount = async (): Promise<Record<string, number>> =>
  Object.fromEntries((await db.query(
    `SELECT account_id::text a, sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::text n
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid GROUP BY 1`, [USMCA])).rows.map((r: any) => [r.a, Number(r.n)]));
const legs = async (je: string): Promise<Record<string, number>> =>
  Object.fromEntries((await db.query(
    `SELECT account_id::text a, sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::bigint n
       FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid AND operating_company_id = $2::uuid GROUP BY 1`,
    [je, USMCA])).rows.map((r: any) => [r.a, Number(r.n)]));
const markerRows = async (marker: string): Promise<string[]> =>
  (await db.query(`SELECT id::text FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND voided_at IS NULL
                     AND (';' || replace(coalesce(notes,''), '; ', ';') || ';') LIKE '%;' || $2 || ';%'`, [USMCA, marker])).rows.map((r: any) => r.id);
/** Live card-difference entries the import posted under a marker (idempotency key). */
const diffEntries = async (marker: string) =>
  (await db.query(
    `SELECT DISTINCT je.id::text AS je, (SELECT array_agg(DISTINCT p2.source_transaction_id::text) FROM accounting.journal_entry_postings p2 WHERE p2.journal_entry_uuid = je.id) AS src
       FROM accounting.journal_entries je JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
      WHERE je.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
        AND p.idempotency_key LIKE 'dreamline-statement:' || $1 || ':' || $2 || ':%'`, [USMCA, marker])).rows as Array<{ je: string; src: string[] }>;
const chicagoDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayGap = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const note = (notes: string, key: string) => (new RegExp(`(?:^|;\\s*)${key}=([^;]*)`).exec(notes) ?? [])[1]?.trim() ?? null;
const markersOn = (notes: string) => notes.match(/dreamline_efs=[^;\s]+/g) ?? [];
const liveDiesel = async () => Number((await db.query(
  `SELECT count(*)::int n FROM accounting.expenses e WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.memo ILIKE 'Diesel%'`, [USMCA])).rows[0].n);

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const before = await byAccount();
  const dieselBefore = await liveDiesel();
  const payable = ((await db.query(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id=$1::uuid AND account_number='2510' AND deactivated_at IS NULL LIMIT 1`, [USMCA])).rows[0] as any)?.id as string
    ?? refuse("no 2510 Dreamline card payable");
  const discountAcct = ((await db.query(
    `SELECT i.default_expense_account_id::text AS a FROM catalogs.items i
      WHERE i.item_name = 'Fuel Card Discount' AND i.deactivated_at IS NULL AND (i.operating_company_id = $1::uuid OR i.operating_company_id IS NULL)
      ORDER BY (i.operating_company_id = $1::uuid) DESC NULLS LAST LIMIT 1`, [USMCA])).rows[0] as any)?.a as string
    ?? refuse("no Fuel Card Discount item");

  type Row = { id: string; unit_id: string; un: string; ft: string; at: string; gal: string; net: number; gross: number | null; disc: number; notes: string; voided: boolean; ref: string | null; ex: string | null; je: string | null; pay: string | null; ps: string | null; ec: number | null };
  const row = async (id: string): Promise<Row> => ((await db.query(
    `SELECT ft.id::text, ft.unit_id::text, u.unit_number un, ft.fuel_type::text ft, coalesce(ft.purchased_at, ft.transaction_at) at, ft.gallons::text gal,
            round(ft.total_cost*100)::bigint net, round(ft.gross_cost*100)::bigint gross, round(coalesce(ft.discount_amount,0)*100)::bigint disc,
            coalesce(ft.notes,'') notes, ft.voided_at IS NOT NULL voided, ft.transaction_reference ref,
            e.id::text ex, e.journal_entry_id::text je, pa.account_number pay, e.posting_status ps, e.total_amount_cents::bigint ec
       FROM fuel.fuel_transactions ft JOIN mdata.units u ON u.id = ft.unit_id
       LEFT JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL
       LEFT JOIN catalogs.accounts pa ON pa.id = e.payment_account_uuid
      WHERE ft.id = $1::uuid AND ft.operating_company_id = $2::uuid`, [id, USMCA])).rows[0] as any)
    ?? refuse(`fuel row ${id} not found`);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  const lines: DreamlineStatementLine[] = [];
  const adopt: Record<string, string> = {}; // efs:item -> true receipt fuel row
  const evidence: string[] = [];
  const expectedDelta: Record<string, number> = {};
  const add = (from: Record<string, number>, sign: number) => { for (const [a, v] of Object.entries(from)) expectedDelta[a] = (expectedDelta[a] ?? 0) + sign * v; };
  const copyRows: Row[] = [];
  const wrongJes: Array<{ je: string; receipt: string; marker: string }> = [];

  for (const p of PAIRS) {
    const c = await row(p.copy);
    const k = await row(p.receipt);
    // the copy = a live, posted 2510 statement row the import wrote for this EFS invoice
    if (c.voided || !c.ex || c.ps !== "posted" || c.pay !== "2510") refuse(`copy ${p.copy} is not a live posted 2510 statement row (already repaired?)`);
    if (!c.notes.includes("443.142 Dreamline statement") || note(c.notes, "efs_invoice") !== p.efs || c.ref !== p.efs || !ITEM_OF[c.ft])
      refuse(`copy ${p.copy} is not the statement row of EFS ${p.efs}`);
    const unitLabel = note(c.notes, "file_unit");
    const card = note(c.notes, "card");
    if (!unitLabel || !card || c.gross === null) refuse(`copy ${p.copy}: statement unit / card / gross missing from the row`);
    // the receipt = the same fill (the lead's duplicate test): same truck, product, company day ±1, gallons within 0.01,
    // receipt total within 5 cents of the card gross; a live posted 2510 Creator document the engine may adopt
    const cDay = chicagoDate(new Date(c.at).toISOString());
    const kDay = chicagoDate(new Date(k.at).toISOString());
    if (k.voided || k.ps !== "posted" || k.pay !== "2510" || k.notes.includes("443.142 Dreamline statement")
        || k.unit_id !== c.unit_id || k.ft !== c.ft || dayGap(cDay, kDay) > 1
        || Math.round(Math.abs(Number(k.gal) - Number(c.gal)) * 1000) > 10
        || Math.abs(n(k.ec)! - n(c.gross)!) > 5
        || dreamlineAdoptionRefused(n(k.ec)!, { gross_cents: n(c.gross)!, net_cents: n(c.net)! }))
      refuse(`copy ${p.copy} and receipt ${p.receipt} are not the same fill (truck / product / day / gallons / amount / rail)`);
    // the receipt's marker today: exactly the measured wrong one, or none
    const on = markersOn(k.notes);
    if (JSON.stringify(on) !== JSON.stringify(p.wrongMarker ? [p.wrongMarker] : [])) refuse(`receipt ${p.receipt} carries ${JSON.stringify(on)}, measured ${p.wrongMarker ?? "none"}`);
    const item = ITEM_OF[c.ft]!;
    const trueMarker = `dreamline_efs=${p.efs}:${item}:1`;
    if ((await markerRows(trueMarker)).length) refuse(`${trueMarker} is already on a receipt (re-measure)`);
    if ((await diffEntries(trueMarker)).length) refuse(`${trueMarker} already has a live card-difference entry (re-measure)`);
    if (p.wrongMarker) {
      const d = await diffEntries(p.wrongMarker);
      if (d.length !== 1 || JSON.stringify(d[0]!.src) !== JSON.stringify([k.ex])) refuse(`marker ${p.wrongMarker}: expected one live card-difference entry on ${k.ex}, found ${JSON.stringify(d)}`);
      if ((await markerRows(p.wrongMarker)).join() !== p.receipt) refuse(`marker ${p.wrongMarker} is on more than its measured receipt`);
      wrongJes.push({ je: d[0]!.je, receipt: p.receipt, marker: p.wrongMarker });
      add(await legs(d[0]!.je), -1);
    }
    lines.push({
      line_number: lines.length + 1, card_number: card, transaction_at: new Date(c.at).toISOString(), local_date: cDay,
      efs_invoice: p.efs, unit_label: unitLabel, driver_name: note(c.notes, "file_driver"), location_name: null, city: null, state: null,
      item, product: dreamlineProduct(item), quantity: Number(c.gal), retail_ppu: null,
      gross_cents: n(c.gross)!, discount_cents: n(c.disc)!, net_cents: n(c.net)!, fee_cents: 0,
    });
    adopt[`${p.efs}:${item}`] = p.receipt;
    // the engine's card difference by its own rule: receipt − card net (> 0: Dr 2510 / Cr Fuel Card Discount; < 0 the
    // cost document Dr Fuel Card Discount / Cr 2510 — the same account delta either way)
    const diff = n(k.ec)! - n(c.net)!;
    if (diff !== 0) add({ [payable]: diff, [discountAcct]: -diff }, 1);
    add(await legs(c.je!), -1);
    copyRows.push(c);
    evidence.push(`EFS ${p.efs} ${item}: copy ${p.copy} (${c.un} ${cDay}, ${c.gal} gal, gross ${c.gross} net ${c.net}) = receipt ${p.receipt} (${k.un} ${kDay}, ${k.gal} gal, ${k.ec}c) · was ${p.wrongMarker ?? "unadopted"} · engine difference ${diff}`);
  }

  // the released wrong lines must still have no statement row of their own (else re-measure); 26789's own receipt
  // must still be held by the measured marker (else it may be runnable — re-measure)
  for (const efs of RELEASED_NOT_IN_DB) {
    const c = Number((await db.query(`SELECT count(*)::int c FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND voided_at IS NULL
                                        AND notes LIKE '%efs_invoice=' || $2 || ';%'`, [USMCA, efs])).rows[0].c);
    if (c !== 0) refuse(`EFS ${efs} now has a statement row in the DB — re-measure before running`);
  }
  {
    const h = RELEASED_RECEIPT_HELD;
    if ((await markerRows(h.heldBy)).join() !== h.ownReceipt) refuse(`EFS ${h.efs}: its own receipt ${h.ownReceipt} is no longer held by ${h.heldBy} — re-measure`);
    const s = await row(h.sibling);
    if (s.voided || note(s.notes, "efs_invoice") !== h.efs) refuse(`EFS ${h.efs}: sibling statement row ${h.sibling} changed — re-measure`);
  }
  const expectedMoves = Object.entries(expectedDelta).filter(([, v]) => v !== 0);

  // ── 1. the copies: one expense void + the fuel row void each ──
  for (const r of copyRows) {
    const v = await voidExpenseDocumentInClientTx(db as never, { operatingCompanyId: USMCA, expenseId: r.ex!, actorUserId: OWNER, reason: REASON });
    // 443.232: the copy's original entry was already reversed by the 443.214 reclassify batch (its live legs are the batch's
    // re-posted lines on the GPS load) — the expense void then has nothing of its own to reverse; the fuel row void below must
    // take the live legs off. Proven by the read-back (no live posting left on the copy, per account).
    if (!v.reversingJeId) console.log(`  expense ${r.ex}: no own entry left to reverse (reclassified by 443.214) — the fuel row void takes the live legs`);
    const fx = await executeVoidCancel("fuel_transaction", { client: db as never, operatingCompanyId: USMCA, entityId: r.id, action: "void", userId: OWNER, reason: REASON });
    if (fx.kind !== "ok") throw new Error(`NOT VERIFIED: fuel row ${r.id} void returned ${fx.kind}`);
    console.log(`  copy ${r.id} (expense ${r.ex}, entry ${r.je}) voided — reversal ${v.reversingJeId}`);
  }
  // ── 2. the wrongly adopted receipts: reverse the wrong card difference, take the wrong marker off ──
  for (const w of wrongJes) {
    const jx = await executeVoidCancel("journal_entry", { client: db as never, operatingCompanyId: USMCA, entityId: w.je, action: "void", userId: OWNER, reason: REASON });
    if (jx.kind !== "ok") throw new Error(`NOT VERIFIED: card-difference entry ${w.je} reversal returned ${jx.kind}`);
    if ((await unstampDreamlineReceiptAdopted(db as never, { companyId: USMCA, fuelTransactionId: w.receipt, marker: w.marker })) !== 1)
      throw new Error(`NOT VERIFIED: marker ${w.marker} not removed from ${w.receipt}`);
    console.log(`  ${w.marker} off ${w.receipt} — entry ${w.je} reversed`);
  }
  // ── 3. the import engine adopts each true receipt for its true line (its own matcher + card-difference poster) ──
  const run = await importDreamlineStatement(db as never, { operating_company_id: USMCA, actor_user_uuid: OWNER, lines });
  const receiptOf = async (expenseId: string | null | undefined) =>
    expenseId ? ((await db.query(`SELECT source_fuel_transaction_id::text f FROM accounting.expenses WHERE id=$1::uuid`, [expenseId])).rows[0] as any)?.f : null;
  for (const r of run.results) {
    const key = `${r.efs_invoice}:${r.item}`;
    if (r.outcome !== "adopted" || (await receiptOf(r.expense_id)) !== adopt[key])
      throw new Error(`NOT VERIFIED: the engine did not adopt ${adopt[key]} for ${key} (${r.outcome} ${r.expense_id ?? ""} ${r.reason ?? ""}) — rolled back`);
    console.log(`  ${key} adopts ${adopt[key]} — card difference ${r.difference_cents ?? 0} cents`);
  }

  // ── read-back ──
  const after = await byAccount();
  const keys = new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(expectedDelta)]);
  const wrongDelta = [...keys].filter((k) => (after[k] ?? 0) - (before[k] ?? 0) !== (expectedDelta[k] ?? 0));
  const tb = Object.values(after).reduce((s, v) => s + v, 0);
  const misplaced: string[] = [];
  for (const [key, fuel] of Object.entries(adopt)) {
    const on = await markerRows(`dreamline_efs=${key}:1`);
    if (on.length !== 1 || on[0] !== fuel) misplaced.push(`${key} on ${JSON.stringify(on)}`);
  }
  // 443.196 read-back fix: a wrong marker must be gone from the WRONG receipt (it is on no receipt here — its line is not re-run)
  for (const w of wrongJes) if ((await markerRows(w.marker)).includes(w.receipt)) misplaced.push(`${w.marker} still on ${w.receipt}`);
  // 443.232: "no live ledger left on a copy" = every account's live postings sourced by the copy (fuel_event / expense, any
  // entry incl. the 443.214 reclass lines) net to zero.
  const copiesLive = Number((await db.query(
    `SELECT count(*)::int n FROM (
       SELECT p.account_id, sum(CASE WHEN p.debit_or_credit::text ILIKE 'd%' THEN p.amount_cents ELSE -p.amount_cents END) net
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted'
        WHERE p.source_transaction_id::text = ANY($1::text[])
           OR p.source_transaction_id::text = ANY($2::text[])
        GROUP BY p.account_id HAVING sum(CASE WHEN p.debit_or_credit::text ILIKE 'd%' THEN p.amount_cents ELSE -p.amount_cents END) <> 0) x`,
    [copyRows.map((r) => r.id), copyRows.map((r) => r.ex)])).rows[0].n);
  const copiesNotVoid = Number((await db.query(`SELECT count(*)::int n FROM fuel.fuel_transactions WHERE id = ANY($1::uuid[]) AND voided_at IS NULL`, [copyRows.map((r) => r.id)])).rows[0].n);
  const wrongLive = Number((await db.query(`SELECT count(*)::int n FROM accounting.journal_entries WHERE id = ANY($1::uuid[]) AND reversed_by_je_id IS NULL`, [wrongJes.map((w) => w.je)])).rows[0].n);
  const plan = await importDreamlineStatement(db as never, { operating_company_id: USMCA, actor_user_uuid: OWNER, lines, dry_run: true });
  const notReconciled = plan.results.filter((r) => r.outcome !== "already_imported").map((r) => `${r.efs_invoice}:${r.item}=${r.outcome}`);
  // the 8 pairs are no longer two live rows of one fill
  const pairsLive = Number((await db.query(
    `SELECT count(*)::int n FROM unnest($1::uuid[], $2::uuid[]) AS p(c, k)
      WHERE EXISTS (SELECT 1 FROM fuel.fuel_transactions WHERE id = p.c AND voided_at IS NULL)
        AND EXISTS (SELECT 1 FROM fuel.fuel_transactions WHERE id = p.k AND voided_at IS NULL)`,
    [PAIRS.map((p) => p.copy), PAIRS.map((p) => p.receipt)])).rows[0].n);
  const dieselAfter = await liveDiesel();
  console.log(evidence.map((e) => `  fact: ${e}`).join("\n"));
  console.log(`expected account moves (computed before any write): ${expectedMoves.map(([a, v]) => `${a}:${v}`).join(", ")}`);
  console.log(`accounts moved ${expectedMoves.length} · other deltas ${wrongDelta.length} · company TB ${tb} · engine card differences ${run.difference_posted_cents} · misplaced markers ${misplaced.length} · live entries on copies ${copiesLive} · copies not void ${copiesNotVoid} · wrong entries live ${wrongLive} · engine re-read not reconciled ${notReconciled.length} · duplicate pairs live ${pairsLive} · live Diesel documents ${dieselBefore} -> ${dieselAfter} (dedupe baseline 272)`);
  console.log(`NOT REPAIRED — owner re-import (statement facts not in the DB): ${RELEASED_NOT_IN_DB.map((e) => `${e}:ULSD`).join(", ")}`);
  console.log(`NOT REPAIRED — ${RELEASED_RECEIPT_HELD.efs}:ULSD facts in the DB but its own receipt ${RELEASED_RECEIPT_HELD.ownReceipt} is held by ${RELEASED_RECEIPT_HELD.heldBy}`);
  if (wrongDelta.length || tb !== 0 || misplaced.length || copiesLive || copiesNotVoid || wrongLive || notReconciled.length || pairsLive || dieselAfter !== dieselBefore - PAIRS.length)
    throw new Error(`NOT VERIFIED: ${JSON.stringify({ wrongDelta, tb, misplaced, copiesLive, copiesNotVoid, wrongLive, notReconciled, pairsLive, dieselBefore, dieselAfter })} — rolled back`);
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

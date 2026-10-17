// LEAD 443.196 (16:35Z) — the Dreamline statement pairings the 443.142 import got wrong on 08-19..21, repaired through
// the engines, every statement fact read from the DATABASE (the statement rows the import already wrote, the adoption
// markers + card facts it stamped on receipts, its card-difference entries) — never the owner's file. Supersedes the
// 443.195 runner (which carried the file's amounts as constants).
//
// Prod measure 2026-10-17 (read-only) — where each statement line lives in the DB:
//   EFS 72968 DEFD   the import's own fuel row 02692fae (efs_invoice / file_unit / card / time / net / gross / discount) — the copy
//   EFS 11946 ULSD   the import's own fuel row f3ec1910 (same) — the copy of the Creator receipt 14996d48
//   EFS 11946 DEFD   marker + stamped gross / discount on receipt 5ea5f41a, its card-difference entry (receipt − net);
//                    time / unit / card from its sibling statement row f3ec1910 (same EFS invoice = same fill)
//   EFS 09992 ULSD   marker + stamped gross / discount on b700c751 (T164's) + its card-difference entry — the line's own
//   EFS 09992 DEFD   marker + stamped gross / discount on 71d18efd (T175's) + its entry      unit / time / card: NOT in the DB
//   EFS 0894204440 ULSD, EFS 05750 ULSD — NOT in the DB (amount_mismatch: the import writes nothing for such a line)
//
// Repair (one transaction):
//   1. the two statement copies (02692fae = 72968 DEFD, f3ec1910 = 11946 ULSD) — each expense voided by the ONE expense
//      void (voidExpenseDocumentInClientTx), each fuel row voided whole (executeVoidCancel 'fuel_transaction') — the
//      443.194 calls;
//   2. the three card-difference entries the wrong pairings posted (09992:ULSD:1 on T164's diesel, 09992:DEFD:1 on
//      T175's DEF, 11946:DEFD:1 on T164's DEF) reversed by the governance JE executor (executeVoidCancel 'journal_entry');
//      the three wrong markers taken off (unstampDreamlineReceiptAdopted — clears the wrong card facts);
//   3. the IMPORT ENGINE itself (importDreamlineStatement, same-truck-first matcher, 443.196) is run on the three lines
//      whose facts are in the DB: it adopts 5ea5f41a (72968 DEFD), 71d18efd (11946 DEFD), 14996d48 (11946 ULSD) and
//      posts each card difference through its own poster. Any other outcome refuses (no insert, no fallback).
//   NOT repaired here (facts absent from the DB → owner re-import of the statement; with the markers released above the
//   engine then adopts b700c751 for 0894204440 ULSD and imports T163's 09992 lines and T175's 05750 through its
//   no-receipt path): EFS 0894204440 ULSD, EFS 09992 ULSD + DEFD, EFS 05750 ULSD. The released 09992 markers' old
//   card-difference idempotency keys stay used (the unique index): the engine never re-posts them — a 09992 line goes
//   through the no-receipt import, and should it ever adopt again the engine records already_imported without stamping.
// Checks: per-account trial balance after == before + exactly (the copies' entries reversed + the three wrong entries
// reversed + the engine's card differences), every other delta 0, company TB 0; read-back: markers, copies void, no
// live entry on a copy, wrong entries reversed, and a DRY RUN of the import engine reads every repaired line as
// already_imported. Default = everything ROLLED BACK.
//   default: dry run · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.196
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
const REASON = "LEAD 443.196: the Dreamline statement import paired statement lines with another truck's receipts / imported a copy of a booked receipt — copies voided, wrong card differences reversed, each line adopts its own receipt through the import engine";

// The measured rows. Every fact below them is READ from the DB and checked; these ids only name what was measured.
const COPIES = [
  { efs: "72968", item: "DEFD", fuel: "02692fae-445b-4e8b-8c53-68effaeacbf7", receipt: "5ea5f41a-23cc-44c5-a16f-c42d48ea1735" },
  { efs: "11946", item: "ULSD", fuel: "f3ec1910-adc6-4443-a095-ce604f489822", receipt: "14996d48-747e-4072-97bf-358a77df79fa" },
];
const WRONG = [ // receipt -> the marker another truck's line stamped on it
  { receipt: "b700c751-bb40-497a-918a-8ede8cbb8744", marker: "dreamline_efs=09992:ULSD:1" },
  { receipt: "71d18efd-a102-4f23-b35b-9c85928af7dc", marker: "dreamline_efs=09992:DEFD:1" },
  { receipt: "5ea5f41a-23cc-44c5-a16f-c42d48ea1735", marker: "dreamline_efs=11946:DEFD:1" },
];
// The line the engine must adopt each receipt for (efs:item -> receipt fuel row).
const ADOPT: Record<string, string> = {
  "72968:DEFD": "5ea5f41a-23cc-44c5-a16f-c42d48ea1735",
  "11946:DEFD": "71d18efd-a102-4f23-b35b-9c85928af7dc",
  "11946:ULSD": "14996d48-747e-4072-97bf-358a77df79fa",
};
// Lines whose facts are NOT in the DB — owner re-import. Refuse if any of them HAS appeared (re-measure first).
const ABSENT = ["0894204440:ULSD", "09992:ULSD", "09992:DEFD", "05750:ULSD"];
const ITEM_OF: Record<string, string> = { diesel: "ULSD", reefer_diesel: "ULSR", def: "DEFD" };

const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.196") throw new Error("--apply requires --auth LEAD-ORDER-443.196");
  // verify-owner-authorization: Lead ruling 443.196 (16:35Z) — Dreamline repair from DB facts through the engines, TB 0.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.196 dreamline repair" });
else if (FORK) await assertNotProduction(db, { label: "443.196 dreamline repair (fork)" });

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
/** Live card-difference entries the import posted under a marker (idempotency key / memo). */
const diffEntries = async (marker: string) =>
  (await db.query(
    `SELECT DISTINCT je.id::text AS je, (SELECT array_agg(DISTINCT p2.source_transaction_id::text) FROM accounting.journal_entry_postings p2 WHERE p2.journal_entry_uuid = je.id) AS src
       FROM accounting.journal_entries je JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
      WHERE je.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
        AND p.idempotency_key LIKE 'dreamline-statement:' || $1 || ':' || $2 || ':%'`, [USMCA, marker])).rows as Array<{ je: string; src: string[] }>;
const chicagoDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const note = (notes: string, key: string) => (new RegExp(`(?:^|;\\s*)${key}=([^;]*)`).exec(notes) ?? [])[1]?.trim() ?? null;

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const before = await byAccount();
  const payable = ((await db.query(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id=$1::uuid AND account_number='2510' AND deactivated_at IS NULL LIMIT 1`, [USMCA])).rows[0] as any)?.id as string
    ?? refuse("no 2510 Dreamline card payable");
  const discountAcct = ((await db.query(
    `SELECT i.default_expense_account_id::text AS a FROM catalogs.items i
      WHERE i.item_name = 'Fuel Card Discount' AND i.deactivated_at IS NULL AND (i.operating_company_id = $1::uuid OR i.operating_company_id IS NULL)
      ORDER BY (i.operating_company_id = $1::uuid) DESC NULLS LAST LIMIT 1`, [USMCA])).rows[0] as any)?.a as string
    ?? refuse("no Fuel Card Discount item");

  // ── facts: every statement line this run touches, read from the DB ──
  type Row = { id: string; unit_id: string; un: string; load_id: string | null; ft: string; at: string; gal: string; net: number; gross: number | null; disc: number; notes: string; voided: boolean; ref: string | null; ex: string | null; je: string | null; pay: string | null; ps: string | null; ec: number | null };
  const row = async (id: string): Promise<Row> => ((await db.query(
    `SELECT ft.id::text, ft.unit_id::text, u.unit_number un, ft.load_id::text, ft.fuel_type::text ft, coalesce(ft.purchased_at, ft.transaction_at) at, ft.gallons::text gal,
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
  const evidence: string[] = [];
  const expectedDelta: Record<string, number> = {};
  const add = (from: Record<string, number>, sign: number) => { for (const [a, v] of Object.entries(from)) expectedDelta[a] = (expectedDelta[a] ?? 0) + sign * v; };

  // the two copies = statement rows the import wrote: their own line facts
  const copyRows: Row[] = [];
  for (const c of COPIES) {
    const r = await row(c.fuel);
    const k = await row(c.receipt);
    if (r.voided || !r.ex || r.ps !== "posted" || r.pay !== "2510") refuse(`copy ${c.fuel} is not a live posted 2510 statement row (already repaired?)`);
    if (!r.notes.includes("443.142 Dreamline statement") || note(r.notes, "efs_invoice") !== c.efs || r.ref !== c.efs || ITEM_OF[r.ft] !== c.item)
      refuse(`copy ${c.fuel} is not the statement row of EFS ${c.efs} ${c.item}`);
    const unitLabel = note(r.notes, "file_unit");
    const card = note(r.notes, "card");
    if (!unitLabel || !card || r.gross === null) refuse(`copy ${c.fuel}: statement unit / card / gross missing from the row`);
    // same purchase as the receipt: truck, load, product, company day, 2510 rail, posted, inside the import's own adoption
    // tolerance; gallons to the hundredth unless the receipt's gallons are the Creator's estimate (DEF, owner 10-10)
    const gallonsEstimated = k.notes.includes("gallons estimated");
    if (k.voided || k.ps !== "posted" || k.pay !== "2510" || k.unit_id !== r.unit_id || k.load_id !== r.load_id || k.ft !== r.ft
        || chicagoDate(new Date(k.at).toISOString()) !== chicagoDate(new Date(r.at).toISOString())
        || (!gallonsEstimated && Math.abs(Number(k.gal) - Number(r.gal)) > 0.01)
        || dreamlineAdoptionRefused(n(k.ec)!, { gross_cents: n(r.gross)!, net_cents: n(r.net)! }))
      refuse(`copy ${c.fuel} and receipt ${c.receipt} are not the same purchase (truck / load / product / day / gallons / rail / amount)`);
    lines.push({
      line_number: lines.length + 1, card_number: card, transaction_at: new Date(r.at).toISOString(), local_date: chicagoDate(new Date(r.at).toISOString()),
      efs_invoice: c.efs, unit_label: unitLabel, driver_name: note(r.notes, "file_driver"), location_name: null, city: null, state: null,
      item: c.item, product: dreamlineProduct(c.item), quantity: Number(r.gal), retail_ppu: null,
      gross_cents: n(r.gross)!, discount_cents: n(r.disc)!, net_cents: n(r.net)!, fee_cents: 0,
    });
    evidence.push(`EFS ${c.efs} ${c.item}: statement row ${c.fuel} (unit ${unitLabel}, card ${card}, gross ${r.gross} net ${r.net} disc ${r.disc}) = receipt ${c.receipt} (${k.un}, ${k.ec} cents)`);
    add(await legs(r.je!), -1);
    copyRows.push(r);
  }

  // the wrong markers: each on the measured receipt, with its live card-difference entry sourced to that receipt
  const wrongJes: string[] = [];
  for (const w of WRONG) {
    const on = await markerRows(w.marker);
    if (on.length !== 1 || on[0] !== w.receipt) refuse(`marker ${w.marker} is on ${JSON.stringify(on)}, measured on ${w.receipt}`);
    const k = await row(w.receipt);
    const d = await diffEntries(w.marker);
    if (d.length !== 1 || JSON.stringify(d[0]!.src) !== JSON.stringify([k.ex])) refuse(`marker ${w.marker}: expected one live card-difference entry on ${k.ex}, found ${JSON.stringify(d)}`);
    wrongJes.push(d[0]!.je);
    add(await legs(d[0]!.je), -1);
  }

  // 11946 DEFD: its card facts are the ones stamped on 5ea5f41a, corroborated by its card-difference entry (receipt − net);
  // its time / unit / card are its fill's — the sibling statement row of the same EFS invoice (f3ec1910)
  {
    const k = await row("5ea5f41a-23cc-44c5-a16f-c42d48ea1735");
    const d = (await diffEntries("dreamline_efs=11946:DEFD:1"))[0]!;
    const l = await legs(d.je);
    const posted = Math.max(...Object.values(l)); // the entry's magnitude (Dr 2510 / Cr discount)
    if (k.gross === null) refuse("11946 DEFD: no card gross stamped on 5ea5f41a");
    const net = n(k.gross)! - n(k.disc)!;
    if (n(k.ec)! - net !== posted) refuse(`11946 DEFD: stamped card net ${net} does not tie to its card-difference entry ${posted} on receipt ${k.ec}`);
    const sib = copyRows[1]!; // f3ec1910 — EFS 11946's statement row
    lines.push({
      line_number: lines.length + 1, card_number: note(sib.notes, "card")!, transaction_at: new Date(sib.at).toISOString(), local_date: chicagoDate(new Date(sib.at).toISOString()),
      efs_invoice: "11946", unit_label: note(sib.notes, "file_unit"), driver_name: note(sib.notes, "file_driver"), location_name: null, city: null, state: null,
      item: "DEFD", product: "def", quantity: null, retail_ppu: null, gross_cents: n(k.gross)!, discount_cents: n(k.disc)!, net_cents: net, fee_cents: 0,
    });
    evidence.push(`EFS 11946 DEFD: card gross ${k.gross} disc ${k.disc} stamped on 5ea5f41a, tied by entry ${d.je} (${posted} = ${k.ec} − ${net}); time/unit/card from sibling row f3ec1910`);
  }

  // the lines whose facts are NOT in the DB must still be absent — else re-measure
  for (const a of ABSENT) {
    const [efs, item] = a.split(":");
    const stmt = (await db.query(`SELECT count(*)::int c FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND voided_at IS NULL
                                    AND notes LIKE '%efs_invoice=' || $2 || ';%' AND fuel_type::text = $3`, [USMCA, efs, item === "DEFD" ? "def" : "diesel"])).rows[0].c;
    if (Number(stmt) !== 0) refuse(`EFS ${a} now has a statement row in the DB — re-measure before running`);
  }

  // the engine's card difference per line, by its own rule from the DB facts: receipt − card net
  // (> 0: Dr 2510 / Cr Fuel Card Discount; < 0: a cost document Dr Fuel Card Discount / Cr 2510)
  let expectedEngine = 0;
  for (const l of lines) {
    const diff = n((await row(ADOPT[`${l.efs_invoice}:${l.item}`]!)).ec)! - l.net_cents;
    expectedEngine += diff;
    if (diff !== 0) add({ [payable]: diff, [discountAcct]: -diff }, 1);
  }

  // ── 1. the copies: one expense void + the fuel row void each ──
  for (const r of copyRows) {
    const v = await voidExpenseDocumentInClientTx(db as never, { operatingCompanyId: USMCA, expenseId: r.ex!, actorUserId: OWNER, reason: REASON });
    if (!v.reversingJeId) throw new Error(`NOT VERIFIED: expense ${r.ex} void produced no reversal`);
    const fx = await executeVoidCancel("fuel_transaction", { client: db as never, operatingCompanyId: USMCA, entityId: r.id, action: "void", userId: OWNER, reason: REASON });
    if (fx.kind !== "ok") throw new Error(`NOT VERIFIED: fuel row ${r.id} void returned ${fx.kind}`);
    console.log(`  copy ${r.id} (expense ${r.ex}, entry ${r.je}) voided — reversal ${v.reversingJeId}`);
  }
  // ── 2. the wrong pairings: reverse the card difference, take the marker off ──
  for (const [i, w] of WRONG.entries()) {
    const jx = await executeVoidCancel("journal_entry", { client: db as never, operatingCompanyId: USMCA, entityId: wrongJes[i]!, action: "void", userId: OWNER, reason: REASON });
    if (jx.kind !== "ok") throw new Error(`NOT VERIFIED: card-difference entry ${wrongJes[i]} reversal returned ${jx.kind}`);
    if ((await unstampDreamlineReceiptAdopted(db as never, { companyId: USMCA, fuelTransactionId: w.receipt, marker: w.marker })) !== 1)
      throw new Error(`NOT VERIFIED: marker ${w.marker} not removed from ${w.receipt}`);
    console.log(`  ${w.marker} off ${w.receipt} — entry ${wrongJes[i]} reversed`);
  }
  // ── 3. the import engine adopts each receipt for its true line (its own matcher + card-difference poster) ──
  const run = await importDreamlineStatement(db as never, { operating_company_id: USMCA, actor_user_uuid: OWNER, lines });
  const receiptOf = async (expenseId: string | null | undefined) =>
    expenseId ? ((await db.query(`SELECT source_fuel_transaction_id::text f FROM accounting.expenses WHERE id=$1::uuid`, [expenseId])).rows[0] as any)?.f : null;
  for (const r of run.results) {
    const key = `${r.efs_invoice}:${r.item}`;
    if (r.outcome !== "adopted" || (await receiptOf(r.expense_id)) !== ADOPT[key])
      throw new Error(`NOT VERIFIED: the engine did not adopt ${ADOPT[key]} for ${key} (${r.outcome} ${r.expense_id ?? ""} ${r.reason ?? ""}) — rolled back`);
    // the engine's own card difference for this line (receipt − card net): Dr 2510 / Cr discount when > 0, a cost document when < 0
    console.log(`  ${key} adopts ${ADOPT[key]} — card difference ${r.difference_cents ?? 0} cents`);
  }
  const engineMoved = run.results.reduce((s, r) => s + (r.difference_cents ?? 0), 0);

  // ── read-back ──
  const after = await byAccount();
  const keys = new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(expectedDelta)]);
  const wrongDelta = [...keys].filter((k) => (after[k] ?? 0) - (before[k] ?? 0) !== (expectedDelta[k] ?? 0));
  const tb = Object.values(after).reduce((s, v) => s + v, 0);
  const misplaced: string[] = [];
  for (const [key, fuel] of Object.entries(ADOPT)) {
    const on = await markerRows(`dreamline_efs=${key}:1`);
    if (on.length !== 1 || on[0] !== fuel) misplaced.push(`${key} on ${JSON.stringify(on)}`);
  }
  // A wrong marker must be gone from the WRONG receipt; the same marker may (correctly) now sit on its true receipt (ADOPT).
  for (const w of WRONG) if ((await markerRows(w.marker)).includes(w.receipt)) misplaced.push(`${w.marker} still on ${w.receipt}`);
  const copiesLive = Number((await db.query(
    `SELECT count(*)::int n FROM accounting.journal_entries WHERE id = ANY($1::uuid[]) AND reversed_by_je_id IS NULL`, [copyRows.map((r) => r.je)])).rows[0].n);
  const copiesNotVoid = Number((await db.query(`SELECT count(*)::int n FROM fuel.fuel_transactions WHERE id = ANY($1::uuid[]) AND voided_at IS NULL`, [copyRows.map((r) => r.id)])).rows[0].n);
  const wrongLive = Number((await db.query(`SELECT count(*)::int n FROM accounting.journal_entries WHERE id = ANY($1::uuid[]) AND reversed_by_je_id IS NULL`, [wrongJes])).rows[0].n);
  const plan = await importDreamlineStatement(db as never, { operating_company_id: USMCA, actor_user_uuid: OWNER, lines, dry_run: true });
  const notReconciled = plan.results.filter((r) => r.outcome !== "already_imported").map((r) => `${r.efs_invoice}:${r.item}=${r.outcome}`);
  const moved = Object.entries(expectedDelta).filter(([, v]) => v !== 0);
  console.log(evidence.map((e) => `  fact: ${e}`).join("\n"));
  console.log(`accounts moved ${moved.length} (${moved.map(([a, v]) => `${a}:${v}`).join(", ")}) · other deltas ${wrongDelta.length} · company TB ${tb} · engine card differences ${engineMoved} (rule ${expectedEngine}) · misplaced markers ${misplaced.length} · live entries on copies ${copiesLive} · copies not void ${copiesNotVoid} · wrong entries live ${wrongLive} · engine re-read not reconciled ${notReconciled.length}`);
  console.log(`OWNER RE-IMPORT (statement facts not in the DB): ${ABSENT.join(", ")}`);
  if (wrongDelta.length || tb !== 0 || engineMoved !== expectedEngine || misplaced.length || copiesLive || copiesNotVoid || wrongLive || notReconciled.length)
    throw new Error(`NOT VERIFIED: ${JSON.stringify({ wrongDelta, tb, engineMoved, expectedEngine, misplaced, copiesLive, copiesNotVoid, wrongLive, notReconciled })} — rolled back`);
  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await db.query("ROLLBACK");
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.196.");
  }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 2000);
}

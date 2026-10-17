// LEAD 443.195 (15:55Z — "close 3 fuel items"), item (b): T164's 08-21 DEF is booked twice — the Settlement Creator's
// receipt 5ea5f41a ($24.82, receipt 2244651) and the Dreamline statement import's copy 02692fae ($24.84, EFS 72968 DEFD).
// Prod measure 2026-10-17 (read-only) against the owner's statement (data_truck_both 2026-10-16, Discounted sheet):
// the 443.142 import paired three statement lines with the WRONG receipts — file order + the any-truck fallback let
// T163's EFS 09992 (08-20 00:54, the first line of the day) take T164's 08-20 diesel b700c751 and T175's 08-20 DEF
// 71d18efd; T175's EFS 11946 DEFD then took T164's 08-21 DEF 5ea5f41a (the only DEF left within $1); T164's own lines
// found their receipts taken: EFS 0894204440 ULSD went amount_mismatch (it matched 787e6d50 and, on main, CONSUMED it —
// the 443.194 diesel double) and EFS 72968 DEFD imported the copy 02692fae.
// True pairing (truck + day + product + amount, every one within the import's own adoption tolerance):
//   EFS 0894204440 ULSD (T164 08-20, card gross 644.78 / net 620.23)  <-> b700c751 ($644.76)   [now carries 09992:ULSD:1]
//   EFS 72968 DEFD      (T164 08-21, card 24.84)                       <-> 5ea5f41a ($24.82)    [now carries 11946:DEFD:1]
//   EFS 11946 DEFD      (T175 08-20, card 24.59)                       <-> 71d18efd ($24.59)    [now carries 09992:DEFD:1]
//   EFS 09992 ULSD/DEFD (T163 08-20)                                   <-> none booked (released; T163's fill — Lead)
// Repair, through the engines only, one transaction:
//   1. the copy 02692fae: its expense voided by the ONE expense void (voidExpenseDocumentInClientTx), its fuel row voided
//      whole by the governance executor (executeVoidCancel 'fuel_transaction') — exactly the 443.194 calls;
//   2. the three card-difference entries the wrong pairings posted (09992:ULSD:1 $39.65, 09992:DEFD:1 $0.88,
//      11946:DEFD:1 $0.23) are reversed by the governance JE executor (executeVoidCancel 'journal_entry');
//   3. each wrong marker is taken off its receipt (unstampDreamlineReceiptAdopted) and the true line ADOPTS the receipt
//      through the import's own adoption path: stampDreamlineReceiptAdopted + the import's card-difference poster
//      (postStatementDifference — card charged less; postStatementCostDifferenceAsExpense — card charged more).
// One transaction: per-account trial balance after == before + exactly (the copy's entry reversed + the three wrong
// difference entries reversed + the two true differences), every other delta 0, company TB 0; read-back: markers where
// the statement says, copy void, no live entry on the copy, wrong entries reversed, a dry run of the import engine
// reads every repaired line as already_imported. Default = everything ROLLED BACK.
//   default: dry run · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.195
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { voidExpenseDocumentInClientTx } from "../../apps/backend/src/accounting/expense-void.service.ts";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.ts";
import {
  dreamlineAdoptionRefused,
  dreamlineProduct,
  importDreamlineStatement,
  postStatementCostDifferenceAsExpense,
  postStatementDifference,
  stampDreamlineReceiptAdopted,
  unstampDreamlineReceiptAdopted,
  type DreamlineStatementLine,
} from "../../apps/backend/src/fuel/dreamline-statement-import.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON = "LEAD 443.195: the Dreamline statement import paired statement lines with another truck's receipts — the copy of T164's 08-21 DEF is voided, the wrong card-difference entries reversed, each statement line adopts its own receipt";

// The copy (statement import of EFS 72968 DEFD) and the receipt it duplicates.
const COPY = { fuel: "02692fae-445b-4e8b-8c53-68effaeacbf7", expense: "e7ea58ba-5c71-4e5d-af24-7f7c6ce44354", je: "d7bc906b-e012-47ed-ab6c-7614d3828c0d", cents: 2484 };
// The owner's statement lines (data_truck_both 2026-10-16, Discounted sheet: rows 17 / 20 / 334), cents as the parser rounds.
type Move = {
  fuel: string; expense: string; receiptCents: number; unit: string; day: string; fuelType: "diesel" | "def";
  wrongMarker: string; wrongJe: string; wrongJeCents: number;
  efs: string; item: string; grossCents: number; netCents: number; discountCents: number;
};
const MOVES: Move[] = [
  { fuel: "b700c751-bb40-497a-918a-8ede8cbb8744", expense: "5d020ea1-6607-48ca-92fe-c65c179c357d", receiptCents: 64476, unit: "T164", day: "2026-08-20", fuelType: "diesel",
    wrongMarker: "dreamline_efs=09992:ULSD:1", wrongJe: "2f6c5411-196c-46b4-9a71-78c1bcfa1654", wrongJeCents: 3965,
    efs: "0894204440", item: "ULSD", grossCents: 64478, netCents: 62023, discountCents: 2455 },
  { fuel: "5ea5f41a-23cc-44c5-a16f-c42d48ea1735", expense: "85f42607-eea1-46d0-ba36-f90c77fededf", receiptCents: 2482, unit: "T164", day: "2026-08-21", fuelType: "def",
    wrongMarker: "dreamline_efs=11946:DEFD:1", wrongJe: "2bb74839-4e19-41df-a25a-a82df2a4754f", wrongJeCents: 23,
    efs: "72968", item: "DEFD", grossCents: 2484, netCents: 2484, discountCents: 0 },
  { fuel: "71d18efd-a102-4f23-b35b-9c85928af7dc", expense: "943bb26f-508b-4d74-b02c-57a344150894", receiptCents: 2459, unit: "T175", day: "2026-08-20", fuelType: "def",
    wrongMarker: "dreamline_efs=09992:DEFD:1", wrongJe: "2556f1a4-fc83-42ad-b513-755db138c5c6", wrongJeCents: 88,
    efs: "11946", item: "DEFD", grossCents: 2459, netCents: 2459, discountCents: 0 },
];
const trueMarker = (m: Move) => `dreamline_efs=${m.efs}:${m.item}:1`;

// LEAD 443.196 (16:35Z): SUPERSEDED — this runner carried the owner's file amounts as constants; statement facts must
// come from the database. Use scripts/ops/2026-10-17-cc3-443-196-dreamline-repair.mts.
throw new Error("SUPERSEDED by LEAD 443.196 — run scripts/ops/2026-10-17-cc3-443-196-dreamline-repair.mts (statement facts from the DB)");
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.195") throw new Error("--apply requires --auth LEAD-ORDER-443.195");
  // verify-owner-authorization: Lead ruling 443.195 (15:55Z) — resolve the DEF double through the engine, TB 0.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.195 dreamline def + pairing" });
else if (FORK) await assertNotProduction(db, { label: "443.195 dreamline def + pairing (fork)" });

const byAccount = async (): Promise<Record<string, number>> =>
  Object.fromEntries(
    (await db.query(`SELECT account_id::text a, sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::text n
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid GROUP BY 1`, [USMCA])).rows.map((r: any) => [r.a, Number(r.n)])
  );
const legs = async (je: string): Promise<Record<string, number>> =>
  Object.fromEntries((await db.query(
    `SELECT account_id::text a, sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::bigint n
       FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid AND operating_company_id = $2::uuid GROUP BY 1`,
    [je, USMCA])).rows.map((r: any) => [r.a, Number(r.n)]));
const liveMarkerRows = async (marker: string): Promise<string[]> =>
  (await db.query(`SELECT id::text FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND voided_at IS NULL
                     AND (';' || replace(coalesce(notes,''), '; ', ';') || ';') LIKE '%;' || $2 || ';%'`, [USMCA, marker])).rows.map((r: any) => r.id);
const refuse = (why: string): never => { throw new Error(`NOT VERIFIED: ${why} — nothing changed`); };

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const before = await byAccount();

  const payable = (await db.query(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id=$1::uuid AND account_number='2510' AND deactivated_at IS NULL LIMIT 1`, [USMCA])).rows[0]?.id
    ?? refuse("no 2510 Dreamline card payable");
  const discount = (await db.query(
    `SELECT i.id::text AS item_id, i.default_expense_account_id::text AS account_id FROM catalogs.items i
      WHERE i.item_name = 'Fuel Card Discount' AND i.deactivated_at IS NULL AND (i.operating_company_id = $1::uuid OR i.operating_company_id IS NULL)
      ORDER BY (i.operating_company_id = $1::uuid) DESC NULLS LAST LIMIT 1`, [USMCA])).rows[0] as { item_id: string; account_id: string } | undefined
    ?? refuse("no Fuel Card Discount item");

  // ── evidence: the copy is a live posted duplicate of 5ea5f41a (same truck, day, product, load, card rail) ──
  const copy = (await db.query(
    `SELECT c.unit_id::text cu, c.load_id::text cl, c.fuel_type::text ct, coalesce(c.purchased_at,c.transaction_at)::date::text cd, round(c.total_cost*100)::bigint cc, c.notes cn,
            k.unit_id::text ku, k.load_id::text kl, k.fuel_type::text kt, coalesce(k.purchased_at,k.transaction_at)::date::text kd,
            e.id::text ce, e.journal_entry_id::text cj, e.posting_status cs, je.reversed_by_je_id IS NULL AND je.status='posted' AS clive,
            ep.payment_account_uuid::text cpay, ek.payment_account_uuid::text kpay
       FROM fuel.fuel_transactions c
       JOIN fuel.fuel_transactions k ON k.id = $3::uuid AND k.operating_company_id = c.operating_company_id AND k.voided_at IS NULL
       JOIN accounting.expenses e ON e.source_fuel_transaction_id = c.id AND e.voided_at IS NULL
       JOIN accounting.expenses ep ON ep.id = e.id
       JOIN accounting.expenses ek ON ek.source_fuel_transaction_id = k.id AND ek.voided_at IS NULL
       JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
      WHERE c.id = $1::uuid AND c.operating_company_id = $2::uuid AND c.voided_at IS NULL`,
    [COPY.fuel, USMCA, MOVES[1]!.fuel])).rows[0] as any;
  if (!copy) refuse(`copy ${COPY.fuel} is not live with a live expense (already repaired?)`);
  if (copy.ce !== COPY.expense || copy.cj !== COPY.je || copy.cs !== "posted" || !copy.clive || Number(copy.cc) !== COPY.cents)
    refuse(`copy ${COPY.fuel} document/entry/amount moved since the measure`);
  if (!String(copy.cn ?? "").includes("443.142 Dreamline statement") || !String(copy.cn).includes("efs_invoice=72968"))
    refuse(`copy ${COPY.fuel} is not the statement import of EFS 72968`);
  if (copy.cu !== copy.ku || copy.cl !== copy.kl || copy.ct !== "def" || copy.kt !== "def" || copy.cd !== copy.kd || copy.cpay !== payable || copy.kpay !== payable)
    refuse(`copy ${COPY.fuel} and receipt ${MOVES[1]!.fuel} are not the same truck / load / day / product / card rail`);

  // ── evidence: every receipt carries the measured wrong marker and its wrong difference entry; the true line fits ──
  for (const m of MOVES) {
    const r = (await db.query(
      `SELECT u.unit_number un, ft.fuel_type::text ty, coalesce(ft.purchased_at,ft.transaction_at)::date::text d, ft.notes,
              e.id::text ex, e.total_amount_cents::bigint c, e.payment_account_uuid::text pay, e.posting_status ps
         FROM fuel.fuel_transactions ft JOIN mdata.units u ON u.id = ft.unit_id
         JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL
        WHERE ft.id = $1::uuid AND ft.operating_company_id = $2::uuid AND ft.voided_at IS NULL`, [m.fuel, USMCA])).rows[0] as any;
    if (!r) refuse(`receipt ${m.fuel} is not live`);
    if (r.ex !== m.expense || Number(r.c) !== m.receiptCents || r.pay !== payable || r.ps !== "posted" || r.un !== m.unit || r.ty !== m.fuelType || r.d !== m.day)
      refuse(`receipt ${m.fuel} moved since the measure`);
    const onIt = (await liveMarkerRows(m.wrongMarker));
    if (onIt.length !== 1 || onIt[0] !== m.fuel) refuse(`marker ${m.wrongMarker} is on ${JSON.stringify(onIt)}, measured on ${m.fuel}`);
    if ((await liveMarkerRows(trueMarker(m))).length !== 0) refuse(`marker ${trueMarker(m)} is already on a live row`);
    const wj = (await db.query(
      `SELECT je.status, je.reversed_by_je_id IS NULL AS live, je.memo,
              (SELECT array_agg(DISTINCT p.source_transaction_id::text) FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = je.id) src
         FROM accounting.journal_entries je WHERE je.id = $1::uuid AND je.operating_company_id = $2::uuid`, [m.wrongJe, USMCA])).rows[0] as any;
    const wl = await legs(m.wrongJe);
    if (!wj || wj.status !== "posted" || !wj.live || !String(wj.memo).includes(m.wrongMarker) || JSON.stringify(wj.src) !== JSON.stringify([m.expense])
        || wl[payable] !== m.wrongJeCents || wl[discount.account_id] !== -m.wrongJeCents)
      refuse(`difference entry ${m.wrongJe} (${m.wrongMarker}) is not the measured live Dr 2510 / Cr discount ${m.wrongJeCents} on ${m.expense}`);
    if (dreamlineProduct(m.item) !== (m.fuelType === "def" ? "def" : "diesel")) refuse(`item ${m.item} is not ${m.fuelType}`);
    if (dreamlineAdoptionRefused(m.receiptCents, { gross_cents: m.grossCents, net_cents: m.netCents }))
      refuse(`receipt ${m.fuel} (${m.receiptCents}) is outside the adoption tolerance for ${trueMarker(m)}`);
  }

  // ── what must move, per account ──
  const expectedDelta: Record<string, number> = {};
  const add = (from: Record<string, number>, sign: number) => { for (const [a, n] of Object.entries(from)) expectedDelta[a] = (expectedDelta[a] ?? 0) + sign * n; };
  add(await legs(COPY.je), -1);
  for (const m of MOVES) add(await legs(m.wrongJe), -1);
  for (const m of MOVES) {
    const diff = m.receiptCents - m.netCents; // > 0: Dr 2510 / Cr discount; < 0: Dr discount / Cr 2510 (a cost document)
    if (diff !== 0) add({ [payable]: diff, [discount.account_id]: -diff }, 1);
  }

  // ── 1. the copy: one expense void + the fuel row void (443.194 engine calls) ──
  const v = await voidExpenseDocumentInClientTx(db as never, { operatingCompanyId: USMCA, expenseId: COPY.expense, actorUserId: OWNER, reason: REASON });
  if (!v.reversingJeId) throw new Error(`NOT VERIFIED: expense ${COPY.expense} void produced no reversal`);
  const fx = await executeVoidCancel("fuel_transaction", { client: db as never, operatingCompanyId: USMCA, entityId: COPY.fuel, action: "void", userId: OWNER, reason: REASON });
  if (fx.kind !== "ok") throw new Error(`NOT VERIFIED: fuel row ${COPY.fuel} void returned ${fx.kind}`);
  console.log(`  copy ${COPY.fuel} (expense ${COPY.expense}, entry ${COPY.je}) voided — reversal ${v.reversingJeId}`);

  // ── 2 + 3. each receipt: reverse the wrong difference, take the wrong marker off, the true line adopts it ──
  for (const m of MOVES) {
    const jx = await executeVoidCancel("journal_entry", { client: db as never, operatingCompanyId: USMCA, entityId: m.wrongJe, action: "void", userId: OWNER, reason: REASON });
    if (jx.kind !== "ok") throw new Error(`NOT VERIFIED: difference entry ${m.wrongJe} reversal returned ${jx.kind}`);
    if ((await unstampDreamlineReceiptAdopted(db as never, { companyId: USMCA, fuelTransactionId: m.fuel, marker: m.wrongMarker })) !== 1)
      throw new Error(`NOT VERIFIED: marker ${m.wrongMarker} not removed from ${m.fuel}`);
    const marker = trueMarker(m);
    const diff = m.receiptCents - m.netCents;
    let posted: string | null = null;
    if (diff !== 0) {
      const input = { companyId: USMCA, actor: OWNER, expenseId: m.expense, differenceCents: diff, date: m.day, marker, payableId: payable, discountAccountId: discount.account_id, discountItemId: discount.item_id };
      posted = diff > 0 ? await postStatementDifference(db as never, input) : await postStatementCostDifferenceAsExpense(db as never, input);
      if (!posted) throw new Error(`NOT VERIFIED: the card difference for ${marker} was already posted — nothing changed`);
    }
    await stampDreamlineReceiptAdopted(db as never, { companyId: USMCA, fuelTransactionId: m.fuel, marker, grossCents: m.grossCents, discountCents: m.discountCents });
    console.log(`  receipt ${m.fuel} (${m.unit} ${m.day} ${m.fuelType}): ${m.wrongMarker} off (entry ${m.wrongJe} reversed ${(jx as any).reversing_entry_ref}) · ${marker} adopts it · card difference ${diff} cents${posted ? ` (entry ${posted})` : ""}`);
  }

  // ── read-back ──
  const after = await byAccount();
  const keys = new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(expectedDelta)]);
  const wrong = [...keys].filter((k) => (after[k] ?? 0) - (before[k] ?? 0) !== (expectedDelta[k] ?? 0));
  const tb = Object.values(after).reduce((s, n) => s + n, 0);
  const moved = Object.entries(expectedDelta).filter(([, n]) => n !== 0);
  const misplaced: string[] = [];
  for (const m of MOVES) {
    const t = await liveMarkerRows(trueMarker(m));
    if (t.length !== 1 || t[0] !== m.fuel) misplaced.push(`${trueMarker(m)} on ${JSON.stringify(t)}`);
    if ((await liveMarkerRows(m.wrongMarker)).length !== 0) misplaced.push(`${m.wrongMarker} still on a live row`);
  }
  const copyLive = Number((await db.query(
    `SELECT count(*)::int n FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid
      WHERE p.operating_company_id=$1::uuid AND je.id = $2::uuid AND je.reversed_by_je_id IS NULL`, [USMCA, COPY.je])).rows[0].n);
  const copyRow = (await db.query(`SELECT voided_at IS NOT NULL v FROM fuel.fuel_transactions WHERE id=$1::uuid`, [COPY.fuel])).rows[0] as any;
  const wrongLive = Number((await db.query(`SELECT count(*)::int n FROM accounting.journal_entries WHERE id = ANY($1::uuid[]) AND reversed_by_je_id IS NULL`, [MOVES.map((m) => m.wrongJe)])).rows[0].n);
  // the import engine itself (dry run, same transaction) must read every repaired line as already reconciled
  const L = (efs: string, item: string, at: string, local: string, unit: string, gross: number, net: number): DreamlineStatementLine => ({
    line_number: 0, card_number: "", transaction_at: at, local_date: local, efs_invoice: efs, unit_label: unit, driver_name: null,
    location_name: null, city: null, state: null, item, product: dreamlineProduct(item), quantity: null, retail_ppu: null,
    gross_cents: gross, discount_cents: gross - net, net_cents: net, fee_cents: 0,
  });
  const plan = await importDreamlineStatement(db as never, {
    operating_company_id: USMCA, actor_user_uuid: OWNER, dry_run: true,
    lines: [
      L("0894204440", "ULSD", "2026-08-20T06:38:00.000Z", "2026-08-20", "164", 64478, 62023),
      L("0894204440", "DEFD", "2026-08-20T06:38:00.000Z", "2026-08-20", "164", 2494, 2494),
      L("72968", "ULSD", "2026-08-21T20:07:00.000Z", "2026-08-21", "164", 60920, 60920),
      L("72968", "DEFD", "2026-08-21T20:07:00.000Z", "2026-08-21", "164", 2484, 2484),
      L("11946", "DEFD", "2026-08-21T01:11:00.000Z", "2026-08-20", "175", 2459, 2459),
    ].map((l, i) => ({ ...l, line_number: i + 1 })),
  });
  const notReconciled = plan.results.filter((r) => r.outcome !== "already_imported").map((r) => `${r.efs_invoice}:${r.item}=${r.outcome}`);
  console.log(`accounts moved ${moved.length} (${moved.map(([a, n]) => `${a}:${n}`).join(", ")}) · other deltas ${wrong.length} · company TB ${tb} · misplaced markers ${misplaced.length} · live entry on the copy ${copyLive} · copy row void ${copyRow?.v} · wrong difference entries live ${wrongLive} · engine re-read not reconciled ${notReconciled.length}`);
  if (wrong.length || tb !== 0 || misplaced.length || copyLive !== 0 || !copyRow?.v || wrongLive !== 0 || notReconciled.length)
    throw new Error(`NOT VERIFIED: ${JSON.stringify({ wrong, tb, misplaced, copyLive, wrongLive, notReconciled })} — rolled back`);
  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await db.query("ROLLBACK");
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.195.");
  }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 2000);
}

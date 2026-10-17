// LEAD 443.198 — the 24 Relay fills whose fuel RECORDS the Settlement Creator wrote at the printed settlement amount.
//
// Prod measure 2026-10-17 (read-only). Settlements posted through the Creator 2026-10-16 22:17-22:22Z wrote each Relay
// fill's fuel.fuel_transactions row at the amount typed off the printed settlement (the PUMP price, netCents —
// settlement-creator.service.ts, the Creator's own INSERT) and no row for the ticket's DEF line. The fill's POSTING
// already read Relay's lines (one live expense per fill = Relay paid + the $2 fee) — the money is right, the record is
// wrong: verify-fuel-transactions-per-load "Relay transaction X paid $A but its live fuel rows sum to $B" x 24.
//   24 fills · 24 live rows recorded $15,190.03 · Relay paid $14,093.44 · 40 product lines (24 diesel + 16 DEF)
//   no live posting, expense, settlement deduction or bank line references any of the 24 rows (each fill's JE source is
//   the Relay fill id; each fill's expense document has source_fuel_transaction_id NULL).
//
// Repair (one transaction, engines only, every fact read from the DB):
//   1. each measured row voided whole by the governed fuel void (executeVoidCancel 'fuel_transaction' — the 443.194 /
//      443.196 / 443.197 call); it reverses nothing here (no posting is sourced by the row) — asserted;
//   2. the fill's records rewritten by THE engine the Creator now uses (fuel/relay-fill-fuel-rows.ts
//      writeRelayFillFuelRows) from integrations.relay_fuel_transaction_lines — one row per product line at Relay's
//      discounted amount / gallons / product (DEF its own fuel_type), Relay's fee on the first row; attribution (vendor,
//      load, driver, unit, ticket, date, location, document, notes) carried from the voided row.
// Checks (read-back, same transaction): the guard's Relay check (every live Relay-linked row set sums to Relay paid) has
// 0 failures company-wide; every account delta 0 (no JE written, none reversed); company TB 0; every settlement's
// gross / deductions / reimbursements / net unchanged; live expense count + total unchanged and each fill's expense
// unchanged; the new rows carry the voided row's load / driver / unit / trailer; 24 voided, 40 written.
//   default: dry run, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.198 (assertIsIntendedProduction)
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.ts";
import { planRelayFillFuelRows, writeRelayFillFuelRows } from "../../apps/backend/src/fuel/relay-fill-fuel-rows.ts";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const AUTH = "LEAD-ORDER-443.198";
const REASON = "LEAD 443.198: the Settlement Creator recorded this Relay fill at the printed settlement amount (pump price) and dropped its DEF line — record voided, the fill's rows rewritten from its own Relay lines (the posting is unchanged)";

// The measured rows. Every fact is READ from the DB and checked; these ids only name what was measured (paid / recorded cents).
const MEASURED: Array<{ fill: string; row: string; paid: number; recorded: number }> = [
  { fill: "0f944466-13b3-4fd6-bd79-18fd84a1d249", row: "c9c299e2-8e61-4d60-88b2-dc2877aa6d7b", paid: 57208, recorded: 67782 },
  { fill: "15b1bece-1b61-4209-b739-5185081ff641", row: "b7ee232b-0eb7-4730-b634-99bf4c2c514b", paid: 74440, recorded: 79189 },
  { fill: "189734fc-5706-4a1a-a3cd-5079759d1210", row: "d3779f0c-240a-42bd-a1bd-8c6c2a09020d", paid: 57834, recorded: 66000 },
  { fill: "1b333f72-8c35-404f-b898-b552dcca9556", row: "692fccc1-fa02-46ea-ac60-00f777898c9e", paid: 63719, recorded: 66684 },
  { fill: "300bf4e7-0ac0-4625-b347-ca91fa14e36a", row: "c92dafa6-0bc5-4fa8-8207-5c07ee9dc802", paid: 87345, recorded: 91901 },
  { fill: "3a2915cc-7cdf-45e0-ad79-76e806369a74", row: "e1be8ccf-acce-49f6-b6c9-2193b0d7204c", paid: 53056, recorded: 59000 },
  { fill: "6099ec0d-f09a-46ec-8fe2-dd06913f5c48", row: "7416c987-7042-4508-8308-00c322b357c2", paid: 61616, recorded: 69000 },
  { fill: "6a87c701-e310-4296-ba18-4ad68e8f2d4c", row: "fa6c53b4-a42c-481f-8139-7c8d3eb275f5", paid: 73394, recorded: 76090 },
  { fill: "6ab2f81a-c7c2-4d68-94e4-f97fd8db83ad", row: "2944833a-2d92-49f2-ad8d-515ca876805d", paid: 63257, recorded: 66366 },
  { fill: "6efb7d79-cc61-43b5-8f55-d7e66f323c2c", row: "1f0f2048-efae-4b1b-a4ff-242cd180fae4", paid: 12783, recorded: 14000 },
  { fill: "7a522401-7487-4e3f-8446-58bbb7c3cc11", row: "8c1f044d-6c1e-4c71-ac2d-02c856cf486f", paid: 70175, recorded: 74313 },
  { fill: "7fa2ca30-4a6d-4dce-bece-f15fd637d3b2", row: "cb3da4f7-8c6b-4cfa-bb47-92e807b4eb18", paid: 72780, recorded: 79592 },
  { fill: "8010cf59-805e-495a-983c-22bba1aca5db", row: "b249e46e-c1f2-4632-801f-4c8449a605d1", paid: 63029, recorded: 69000 },
  { fill: "8b6ffdd3-b980-4a3a-918d-8762c3d39a01", row: "84dec35d-2202-40ec-926c-9325c4491f3b", paid: 2984, recorded: 135 },
  { fill: "8d989806-b3c4-4943-8b22-4b098a2c97d3", row: "8f3019ff-7459-4fc3-9210-f0134c3b8290", paid: 28073, recorded: 29000 },
  { fill: "94b297ae-bed5-4fbb-ac29-e648aeccee5d", row: "3e80b4d1-fe9c-4545-b754-a5a93781e230", paid: 66566, recorded: 72628 },
  { fill: "a042a7ce-0ec4-4d4b-8b70-9846d7732eab", row: "c84cfae0-6f51-4c89-8d4f-2c80dd1b5297", paid: 67915, recorded: 65008 },
  { fill: "a3594764-c215-4ae1-99cd-e951b0f124eb", row: "dd1b2347-a1ce-4a00-b77c-f0d474db5296", paid: 66430, recorded: 72213 },
  { fill: "c2fcc2b2-ed3a-49d4-8009-91ba186f2ea8", row: "11a31881-7824-49d0-9a51-a764b5e38ecc", paid: 76330, recorded: 85021 },
  { fill: "d007a2f8-a14e-4bb8-a7db-db40a0f37acd", row: "e6923dd4-5e5f-45a6-be72-05571837c632", paid: 41998, recorded: 46029 },
  { fill: "d02545f9-0140-4bb4-ba88-a52898ef39a5", row: "017f140f-3cec-4c67-848d-ea660e071c4d", paid: 62175, recorded: 64999 },
  { fill: "e1b337e4-caef-4271-b474-03214dd7d3e1", row: "6e11cd17-9d4b-434d-90f4-e1870cd1724d", paid: 47314, recorded: 55368 },
  { fill: "e6decde3-588d-4647-855e-49a1d37515ed", row: "b48ef86b-3760-41e8-92d8-66e634580ccf", paid: 69702, recorded: 74672 },
  { fill: "f2182a1a-e882-4b45-8726-257c1666770e", row: "0a1a109f-8c31-4dbc-b4db-41b8b8a20e3a", paid: 69221, recorded: 75013 },
];
const EXPECT_WRITTEN = 40;

const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== AUTH) throw new Error(`--apply requires --auth ${AUTH}`);
  // verify-owner-authorization: Lead order 443.198 — Relay fuel records rewritten from the fills' own lines through the engine; no posting moves.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.198 relay fuel records" });
else if (FORK) await assertNotProduction(db, { label: "443.198 relay fuel records (fork)" });

const refuse = (why: string): never => { throw new Error(`NOT VERIFIED: ${why} — nothing changed`); };
const byAccount = async (): Promise<Record<string, number>> =>
  Object.fromEntries((await db.query(
    `SELECT account_id::text a, sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::text n
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid GROUP BY 1`, [USMCA])).rows.map((r: any) => [r.a, Number(r.n)]));
const jeCount = async () => Number((await db.query(`SELECT count(*)::int n FROM accounting.journal_entries WHERE operating_company_id=$1::uuid`, [USMCA])).rows[0].n);
const settlements = async () => (await db.query(
  `SELECT md5(string_agg(id::text || ':' || coalesce(gross_pay::text,'') || ':' || coalesce(deductions_total::text,'') || ':' ||
                         coalesce(reimbursements_total::text,'') || ':' || coalesce(net_pay::text,'') || ':' || coalesce(voided_at::text,''), ',' ORDER BY id)) h,
          count(*)::int n
     FROM driver_finance.driver_settlements WHERE operating_company_id=$1::uuid`, [USMCA])).rows[0] as { h: string; n: number };
const expenses = async () => (await db.query(
  `SELECT count(*)::int n, coalesce(sum(total_amount_cents),0)::text c,
          md5(string_agg(id::text || ':' || total_amount_cents || ':' || coalesce(journal_entry_id::text,'') || ':' || posting_status, ',' ORDER BY id)) h
     FROM accounting.expenses WHERE operating_company_id=$1::uuid AND voided_at IS NULL`, [USMCA])).rows[0] as { n: number; c: string; h: string };
/** The guard's Relay check, company-wide: every Relay fill with live rows must sum to Relay's paid (and be live). */
const relayFailures = async () => (await db.query(
  `SELECT rt.id::text fill, rt.total_amount_paid_cents::bigint paid, sum(round(ft.total_cost*100))::bigint live
     FROM fuel.fuel_transactions ft JOIN integrations.relay_fuel_transactions rt ON rt.id = ft.relay_fuel_transaction_id
    WHERE ft.operating_company_id=$1::uuid AND ft.voided_at IS NULL AND ft.archived_at IS NULL
    GROUP BY rt.id, rt.total_amount_paid_cents, rt.voided_at, rt.is_active
   HAVING sum(round(ft.total_cost*100))::bigint <> rt.total_amount_paid_cents OR rt.voided_at IS NOT NULL OR rt.is_active IS FALSE`, [USMCA])).rows;

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const before = await byAccount();
  const jesBefore = await jeCount();
  const setBefore = await settlements();
  const expBefore = await expenses();
  const relayBefore = await relayFailures();

  type Old = { id: string; vendor_id: string; load_id: string | null; driver_id: string | null; unit_id: string | null; trailer_id: string | null;
    ref: string | null; at: string; city: string | null; exemption: string | null; doc: string | null; notes: string | null; cents: number; voided: boolean };
  const plan: Array<{ m: (typeof MEASURED)[number]; old: Old; lines: number; feeCents: number; expense: string }> = [];
  for (const m of MEASURED) {
    const old = ((await db.query(
      `SELECT ft.id::text, ft.vendor_id::text, ft.load_id::text, ft.driver_id::text, ft.unit_id::text, ft.trailer_id::text,
              ft.transaction_reference ref, coalesce(ft.purchased_at, ft.transaction_at) at, ft.location_city city,
              ft.load_exemption_reason exemption, ft.source_doc_id::text doc, ft.notes, round(ft.total_cost*100)::bigint cents,
              ft.voided_at IS NOT NULL voided
         FROM fuel.fuel_transactions ft
        WHERE ft.id=$1::uuid AND ft.operating_company_id=$2::uuid AND ft.relay_fuel_transaction_id=$3::uuid`, [m.row, USMCA, m.fill])).rows[0] as any)
      ?? refuse(`row ${m.row} of fill ${m.fill} not found`);
    if (old.voided) refuse(`row ${m.row} is already void (already repaired?)`);
    if (Number(old.cents) !== m.recorded) refuse(`row ${m.row} records ${old.cents}, measured ${m.recorded} — re-measure`);
    // the fill's only live row
    const liveOfFill = Number((await db.query(`SELECT count(*)::int n FROM fuel.fuel_transactions WHERE relay_fuel_transaction_id=$1::uuid AND voided_at IS NULL AND archived_at IS NULL`, [m.fill])).rows[0].n);
    if (liveOfFill !== 1) refuse(`fill ${m.fill} has ${liveOfFill} live rows, measured 1`);
    // no money hangs off the row: no posting sourced by it, no expense / deduction / bank line naming it
    const refs = (await db.query(
      `SELECT (SELECT count(*) FROM accounting.journal_entry_postings p WHERE p.source_transaction_id = $1)::int postings,
              (SELECT count(*) FROM accounting.expenses e WHERE e.source_fuel_transaction_id = $1::uuid AND e.voided_at IS NULL)::int expenses,
              (SELECT count(*) FROM driver_finance.driver_settlement_deductions d WHERE d.source_fuel_transaction_id = $1::uuid)::int deductions,
              (SELECT count(*) FROM banking.bank_transactions b WHERE b.matched_fuel_transaction_id = $1::uuid)::int bank`, [m.row])).rows[0] as any;
    if (refs.postings || refs.expenses || refs.deductions || refs.bank) refuse(`row ${m.row} carries money references ${JSON.stringify(refs)} — STOP, not a record-only repair`);
    // the fill: Relay paid as measured, posted ONCE with ONE live expense document (paid + fee)
    const f = await planRelayFillFuelRows(db as never, USMCA, m.fill);
    if (f.fuel_paid_cents !== m.paid) refuse(`fill ${m.fill} paid ${f.fuel_paid_cents}, measured ${m.paid}`);
    const exp = (await db.query(
      `SELECT DISTINCT e.id::text, e.total_amount_cents::bigint c FROM accounting.expenses e
         JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = e.journal_entry_id
        WHERE e.operating_company_id=$1::uuid AND e.voided_at IS NULL AND p.source_transaction_id = $2`, [USMCA, m.fill])).rows as any[];
    if (exp.length !== 1 || Number(exp[0].c) !== f.fuel_paid_cents + f.fee_cents) refuse(`fill ${m.fill}: expected one live expense = paid + fee, found ${JSON.stringify(exp)}`);
    plan.push({ m, old: { ...old, cents: Number(old.cents) }, lines: f.plans.length, feeCents: f.fee_cents, expense: exp[0].id });
  }
  const planned = plan.reduce((s, p) => s + p.lines, 0);
  if (planned !== EXPECT_WRITTEN) refuse(`the fills carry ${planned} product lines, measured ${EXPECT_WRITTEN}`);

  // ── 1 + 2: void the measured record, rewrite the fill's records from its own lines (the Creator's engine) ──
  const written: Array<{ fill: string; old: string; rows: Array<{ id: string; fuel_type: string; total_cents: number }> }> = [];
  for (const p of plan) {
    const fx = await executeVoidCancel("fuel_transaction", { client: db as never, operatingCompanyId: USMCA, entityId: p.old.id, action: "void", userId: OWNER, reason: REASON });
    if (fx.kind !== "ok") throw new Error(`NOT VERIFIED: fuel row ${p.old.id} void returned ${fx.kind}`);
    if ((fx as any).reversing_entry_ref) throw new Error(`NOT VERIFIED: voiding record ${p.old.id} reversed a journal entry — not record-only`);
    const rows = await writeRelayFillFuelRows(db as never, {
      operatingCompanyId: USMCA,
      relayFillId: p.m.fill,
      vendorId: p.old.vendor_id,
      loadId: p.old.load_id,
      driverId: p.old.driver_id,
      unitId: p.old.unit_id,
      reeferTrailerId: p.old.trailer_id,
      reference: p.old.ref,
      purchasedAt: new Date(p.old.at).toISOString(),
      locationCity: p.old.city,
      loadExemptionReason: p.old.exemption,
      actorUserId: OWNER,
      sourceDocId: p.old.doc,
      notes: p.old.notes,
    });
    written.push({ fill: p.m.fill, old: p.old.id, rows: rows.map((r) => ({ id: r.id, fuel_type: r.fuel_type, total_cents: r.total_cents })) });
    console.log(`  fill ${p.m.fill.slice(0, 8)}: ${p.old.id.slice(0, 8)} (${p.old.cents}c) voided -> ${rows.map((r) => `${r.id.slice(0, 8)} ${r.fuel_type} ${r.total_cents}c`).join(" + ")} (Relay paid ${p.m.paid}c)`);
  }
  await appendCrudAudit(db as never, OWNER, "fuel.relay_fill_records_rewritten", {
    operating_company_id: USMCA, auth_id: AUTH, reason: REASON,
    fills: written.map((w) => ({ relay_fill_id: w.fill, voided_fuel_transaction_id: w.old, fuel_transaction_ids: w.rows.map((r) => r.id) })),
  }, "warning", "LEAD-443.198");

  // ── read-back ── (deferred constraint triggers — tier-1 unit/driver, void-with-live-postings — fire NOW, dry run included)
  await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  const after = await byAccount();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const moved = [...keys].filter((k) => (after[k] ?? 0) !== (before[k] ?? 0));
  const tb = Object.values(after).reduce((s, v) => s + v, 0);
  const jesAfter = await jeCount();
  const setAfter = await settlements();
  const expAfter = await expenses();
  const relayAfter = await relayFailures();
  const newIds = written.flatMap((w) => w.rows.map((r) => r.id));
  const attrDrift = Number((await db.query(
    `SELECT count(*)::int n FROM fuel.fuel_transactions n JOIN fuel.fuel_transactions o ON o.id = ANY($2::uuid[]) AND o.relay_fuel_transaction_id = n.relay_fuel_transaction_id
      WHERE n.id = ANY($1::uuid[]) AND (n.load_id IS DISTINCT FROM o.load_id OR n.driver_id IS DISTINCT FROM o.driver_id
            OR n.unit_id IS DISTINCT FROM o.unit_id OR n.trailer_id IS DISTINCT FROM o.trailer_id OR n.vendor_id IS DISTINCT FROM o.vendor_id
            OR n.transaction_reference IS DISTINCT FROM o.transaction_reference)`,
    [newIds, plan.map((p) => p.old.id)])).rows[0].n);
  const oldLive = Number((await db.query(`SELECT count(*)::int n FROM fuel.fuel_transactions WHERE id = ANY($1::uuid[]) AND voided_at IS NULL`, [plan.map((p) => p.old.id)])).rows[0].n);
  const fillExpUnchanged = Number((await db.query(
    `SELECT count(*)::int n FROM accounting.expenses WHERE id = ANY($1::uuid[]) AND voided_at IS NULL`, [plan.map((p) => p.expense)])).rows[0].n);
  const relayFixed = relayAfter.filter((r: any) => MEASURED.some((m) => m.fill === r.fill)).length;
  console.log(`relay check: ${relayBefore.length} failure(s) before -> ${relayAfter.length} after (${relayFixed} of the measured fills)`);
  console.log(`records voided ${plan.length - oldLive}/${plan.length} · written ${newIds.length}/${EXPECT_WRITTEN} · attribution drift ${attrDrift} · accounts moved ${moved.length} · company TB ${tb} · journal entries ${jesBefore} -> ${jesAfter} · settlements ${setBefore.n} ${setBefore.h === setAfter.h ? "unchanged" : "CHANGED"} · live expenses ${expBefore.n}/${expBefore.c}c -> ${expAfter.n}/${expAfter.c}c ${expBefore.h === expAfter.h ? "unchanged" : "CHANGED"} · fill expenses live ${fillExpUnchanged}/${plan.length}`);
  if (relayAfter.length || moved.length || tb !== 0 || jesAfter !== jesBefore || setBefore.h !== setAfter.h || expBefore.h !== expAfter.h
      || oldLive || newIds.length !== EXPECT_WRITTEN || attrDrift || fillExpUnchanged !== plan.length)
    throw new Error(`NOT VERIFIED: ${JSON.stringify({ relayAfter: relayAfter.length, moved, tb, jesBefore, jesAfter, oldLive, written: newIds.length, attrDrift, fillExpUnchanged })} — rolled back`);
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

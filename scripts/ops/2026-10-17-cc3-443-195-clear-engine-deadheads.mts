// LEAD 443.195 (ruling 15:55Z): "69 Creator loads with an engine-filled miles_deadhead not on their signed document: clear to
// NULL through the mileage engine with an audit row each (owner 2026-09-02: blank = honest unknown; the document decides
// Creator pay). 0 pay impact proven first; read-back."
//
// Before #26988 the Settlement Creator seed called fillLoadDeadhead (Google practical) whenever the signed document printed no
// empty miles. This clears those engine values through the ONE miles_deadhead writer — clearEngineDeadhead
// (apps/backend/src/dispatch/mileage/miles-recommendations.service.ts): miles_deadhead + its method -> NULL, miles_choice.empty
// -> source 'document' / value NULL (the cleared engine value kept), audit 'dispatch.load.miles_deadhead_cleared' per load.
//
// SELECTION BY EVIDENCE ON THE ROW (the load-number list below is a cross-check only):
//   a live USMCA load seeded by the Settlement Creator (notes 'Settlement Creator R-186.1 seed…')
//   whose miles_deadhead the engine wrote: miles_choice.empty.source = 'google', method google_practical_*, the recorded engine
//   value = the column value, and a 'dispatch.load.deadhead_filled' audit row for the load.
// PAY IMPACT 0, proven per load BEFORE any write — the whole run is refused otherwise:
//   no live (non-voided) deadhead_pay settlement line on the load (by load_id or through its driver bill), and no driver bill
//   for the load (live or voided) carrying a non-zero miles_deadhead or deadhead_pay_cents.
// READ-BACK: 0 selected loads still carry an engine deadhead; one audit row per load; bills + settlement lines of these loads
// (md5 of their money columns), the loads' other miles columns, these loads' postings — all unchanged; trial balance
// unchanged and 0. No JE: nothing here posts.
//
//   default: DRY RUN in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) ·
//   --apply --auth LEAD-ORDER-443.195 (assertIsIntendedProduction; the selection must equal the 69-load cross-check list).
//   --company <uuid>: local rehearsal only (a localhost DATABASE_URL, never with --apply / --fork-commit).
import { createHash } from "node:crypto";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { clearEngineDeadhead } from "../../apps/backend/src/dispatch/mileage/miles-recommendations.service.ts";

const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON =
  "Lead 443.195: engine (Google) deadhead not on the signed settlement document — cleared to blank; the document decides Creator pay (owner 2026-09-02)";
// Cross-check only (prod read-only 2026-10-17, CC-3 #26988 VERIFY-1): the 69 loads the evidence selects today.
const CROSS_CHECK = [
  "13497", "13498", "13502", "13504", "13505", "13506", "13517", "13519", "13522", "13523", "13525", "13527", "13529", "13530",
  "13531", "13532", "13533", "13535", "13539", "13542", "13545", "13547", "13550", "13551", "13555", "13558", "13561", "13564",
  "13565", "13569", "13570", "13571", "13572", "13573", "13576", "13578", "13579", "13581", "13582", "13583", "13588", "13590",
  "13595", "13596", "13597", "13602", "13604", "13605", "13610", "13612", "13613", "13614", "13615", "13616", "13618", "13620",
  "13621", "13623", "13625", "13627", "13638", "13639", "13641", "13642", "13643", "13645", "13646", "13652", "13657",
];
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] ?? "" : null; };
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const COMPANY_OVERRIDE = arg("--company");
if (APPLY && arg("--auth") !== "LEAD-ORDER-443.195") throw new Error("--apply requires --auth LEAD-ORDER-443.195");
// verify-owner-authorization: Lead ruling 443.195 15:55Z carries the owner's 2026-09-02 law ("blank = honest unknown").
if (COMPANY_OVERRIDE && (APPLY || FORK)) throw new Error("--company is a local rehearsal flag only");
if (COMPANY_OVERRIDE && !/@(localhost|127\.0\.0\.1)[:/]|^postgres(ql)?:\/\/\/|^postgres(ql)?:\/\/[^@]*$/.test(process.env.DATABASE_URL ?? ""))
  throw new Error("--company needs a localhost DATABASE_URL");
const CO = COMPANY_OVERRIDE ?? "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.195 clear engine deadheads" });
else if (FORK) await assertNotProduction(db, { label: "443.195 clear engine deadheads (fork)" });

const q = async <T = any>(sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows as T[];
const md5 = (x: unknown) => createHash("md5").update(JSON.stringify(x)).digest("hex");

const SELECT_SQL = `
  SELECT l.id::text, l.load_number, l.miles_deadhead::text dh, l.deadhead_miles_calculation_method method
    FROM mdata.loads l
   WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL
     AND COALESCE(l.notes, '') LIKE 'Settlement Creator R-186.1 seed%'
     AND l.miles_deadhead IS NOT NULL
     AND l.miles_choice->'empty'->>'source' = 'google'
     AND l.deadhead_miles_calculation_method IN ('google_practical_prev_stop', 'google_practical_samsara_position')
     AND (l.miles_choice->'empty'->>'value')::numeric = l.miles_deadhead
     AND EXISTS (SELECT 1 FROM audit.audit_events a WHERE a.event_class = 'dispatch.load.deadhead_filled' AND a.payload->>'load_id' = l.id::text)
   ORDER BY l.load_number`;

// Pay impact per load: live deadhead_pay lines (direct or through the load's bills) and bills carrying deadhead.
const payImpact = (ids: string[]) => q<{ load_number: string; live_dh_lines: number; voided_dh_lines: number; bills: number; bills_with_dh: number }>(
  `SELECT l.load_number,
          (SELECT count(*) FROM driver_finance.settlement_lines sl
            WHERE sl.line_type = 'deadhead_pay' AND sl.voided_at IS NULL
              AND (sl.load_id = l.id OR sl.source_driver_bill_id IN (SELECT b.id FROM driver_finance.driver_bills b WHERE b.load_id = l.id)))::int live_dh_lines,
          (SELECT count(*) FROM driver_finance.settlement_lines sl
            WHERE sl.line_type = 'deadhead_pay' AND sl.voided_at IS NOT NULL
              AND (sl.load_id = l.id OR sl.source_driver_bill_id IN (SELECT b.id FROM driver_finance.driver_bills b WHERE b.load_id = l.id)))::int voided_dh_lines,
          (SELECT count(*) FROM driver_finance.driver_bills b WHERE b.load_id = l.id)::int bills,
          (SELECT count(*) FROM driver_finance.driver_bills b WHERE b.load_id = l.id
              AND (COALESCE(b.miles_deadhead, 0) <> 0 OR COALESCE(b.deadhead_pay_cents, 0) <> 0))::int bills_with_dh
     FROM mdata.loads l WHERE l.id = ANY($1::uuid[]) ORDER BY l.load_number`, [ids]);

const moneyHash = async (ids: string[]) => ({
  bills: md5(await q(`SELECT b.id, b.load_id, b.driver_id, b.status, b.gross_amount_cents, b.miles_basis, b.miles_basis_type, b.rate_per_mile_cents,
          b.miles_deadhead, b.rate_empty_per_mile_cents, b.loaded_pay_cents, b.deadhead_pay_cents, b.settled_in_settlement_id, b.voided_at
     FROM driver_finance.driver_bills b WHERE b.load_id = ANY($1::uuid[]) ORDER BY b.id`, [ids])),
  lines: md5(await q(`SELECT sl.id, sl.settlement_id, sl.line_type, sl.amount, sl.quantity, sl.rate_cents, sl.source_driver_bill_id, sl.load_id, sl.voided_at
     FROM driver_finance.settlement_lines sl
    WHERE sl.load_id = ANY($1::uuid[]) OR sl.source_driver_bill_id IN (SELECT b.id FROM driver_finance.driver_bills b WHERE b.load_id = ANY($1::uuid[]))
    ORDER BY sl.id`, [ids])),
  load_money: md5(await q(`SELECT id, miles_practical, miles_shortest, loaded_miles, rate_total_cents, driver_pay_rate_per_mile, status
     FROM mdata.loads WHERE id = ANY($1::uuid[]) ORDER BY id`, [ids])),
  postings: md5(await q(`SELECT id, journal_entry_uuid, account_id, debit_or_credit, amount_cents
     FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid AND load_id = ANY($2::uuid[]) ORDER BY id`, [CO, ids])),
});
const tb = async () => (await q<{ net: string }>(
  `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text net
     FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [CO]))[0].net;

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [CO]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const mode = APPLY ? "APPLY (prod)" : FORK ? "FORK COMMIT" : "DRY RUN (rolled back)";

  const sel = await q<{ id: string; load_number: string; dh: string; method: string }>(SELECT_SQL, [CO]);
  const ids = sel.map((r) => r.id);
  const nums = sel.map((r) => r.load_number);
  const notInList = nums.filter((n) => !CROSS_CHECK.includes(n));
  const listNotSel = CROSS_CHECK.filter((n) => !nums.includes(n));
  const totalMi = sel.reduce((s, r) => s + Number(r.dh), 0);
  console.log(`${mode} · selected by evidence ${sel.length} loads (${totalMi.toFixed(1)} engine mi) · cross-check list ${CROSS_CHECK.length}: ` +
    `selected-not-listed ${notInList.length} [${notInList.join(" ")}] · listed-not-selected ${listNotSel.length} [${listNotSel.join(" ")}]`);
  if (!sel.length) throw new Error("REFUSE: the evidence selects no load");
  if ((APPLY || FORK) && (notInList.length || listNotSel.length)) throw new Error("REFUSE: the evidence selection differs from the 69-load cross-check — re-measure before writing");

  // 1) PAY IMPACT 0 — proven before any write.
  const pay = await payImpact(ids);
  const withPay = pay.filter((p) => p.live_dh_lines > 0 || p.bills_with_dh > 0);
  console.log(`pay impact: live deadhead_pay lines ${pay.reduce((s, p) => s + p.live_dh_lines, 0)} · voided deadhead_pay lines ` +
    `${pay.reduce((s, p) => s + p.voided_dh_lines, 0)} · bills ${pay.reduce((s, p) => s + p.bills, 0)} · bills carrying deadhead ` +
    `${pay.reduce((s, p) => s + p.bills_with_dh, 0)} · loads with pay impact ${withPay.length}`);
  if (withPay.length) throw new Error(`REFUSE: pay impact on ${withPay.map((p) => p.load_number).join(" ")} — the engine value reached pay`);

  const tb0 = await tb();
  const h0 = await moneyHash(ids);
  const audit0 = Number((await q<{ n: string }>(`SELECT count(*)::text n FROM audit.audit_events WHERE event_class = 'dispatch.load.miles_deadhead_cleared'
      AND payload->>'load_id' = ANY($1::text[])`, [ids]))[0].n);

  // 2) Clear each through the engine.
  for (const r of sel) {
    const res = await clearEngineDeadhead(db as never, { operatingCompanyId: CO, loadId: r.id, actorUserId: OWNER, reason: REASON });
    if (res.status !== "cleared") throw new Error(`REFUSE ${r.load_number}: engine refused — ${res.reason}`);
    console.log(`  ${r.load_number}: cleared ${res.cleared_miles} mi (${res.cleared_method}) -> NULL`);
  }

  // 3) Read-back.
  const still = (await q<{ n: string }>(`SELECT count(*)::text n FROM mdata.loads WHERE id = ANY($1::uuid[])
      AND (miles_deadhead IS NOT NULL OR deadhead_miles_calculation_method IS NOT NULL OR miles_choice->'empty'->>'source' IS DISTINCT FROM 'document'
           OR miles_choice->'empty'->'value' <> 'null'::jsonb)`, [ids]))[0].n;
  const again = (await q(SELECT_SQL, [CO])).length;
  const audit1 = Number((await q<{ n: string }>(`SELECT count(*)::text n FROM audit.audit_events WHERE event_class = 'dispatch.load.miles_deadhead_cleared'
      AND payload->>'load_id' = ANY($1::text[])`, [ids]))[0].n);
  const h1 = await moneyHash(ids);
  const tb1 = await tb();
  const pay1 = await payImpact(ids);
  console.log(`read-back: selected loads still carrying a deadhead ${still} · evidence re-select ${again} · audit rows +${audit1 - audit0} of ${sel.length}`);
  console.log(`money md5 before ${JSON.stringify(h0)}\n          after  ${JSON.stringify(h1)}\ntrial balance before ${tb0} after ${tb1}`);
  if (Number(still) !== 0 || again !== 0) throw new Error("NOT VERIFIED: a selected load still carries an engine deadhead");
  if (audit1 - audit0 !== sel.length) throw new Error("NOT VERIFIED: not one audit row per load");
  if (JSON.stringify(h0) !== JSON.stringify(h1)) throw new Error("NOT VERIFIED: bills / settlement lines / load money / postings changed");
  if (JSON.stringify(pay) !== JSON.stringify(pay1)) throw new Error("NOT VERIFIED: pay-impact read changed");
  if (tb0 !== tb1 || Number(tb1) !== 0) throw new Error("NOT VERIFIED: trial balance moved or not 0");

  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log(`COMMITTED · ${sel.length} engine deadheads cleared`);
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

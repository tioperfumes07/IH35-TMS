// LEAD 443.197 (17:45Z GO, required-live-load-guard item 4): "void the 22 duplicate pending deductions
// (voidSettlementDeduction) + the 14 orphan reimbursements (reimbursement void writer) — the signed P-0098..P-0101 tie
// from their own lines; prove each settlement's net is unchanged before/after. Audited."
//
// Two identical runs of a settlement-backfill seed (2026-10-16 15:02–15:05Z and 15:29–15:33Z, actor Owner) wrote, next to
// the four signed settlements P-0098..P-0101 (documents 5839–5842), pending deduction rows and pending reimbursement rows
// the settlements never took: each settlement already ties TOTAL DUE from its own lines. Left pending, every one of them is
// picked up by the next materialize of a settlement covering its load (settlement-lines-materialize.service.ts selects
// pending/unapplied deductions and unsettled reimbursements by load) — so ALL are voided, not "keep one per group".
//
// SELECTION BY EVIDENCE ON THE ROW (counts must equal 22 + 14 — refused otherwise):
//   deduction     : USMCA · not voided · status 'pending' · applied_to_settlement_id NULL · nothing collected (derived
//                   remaining = amount) · named by NO settlement line · created by Owner inside one of the two run windows ·
//                   reason ends "— settlement <doc> (historical backfill)" where <doc> is the source document of the signed
//                   settlement (P-0098..P-0101) whose lines carry the deduction's load.
//   reimbursement : same, plus paid_at / journal_entry_id / settlement_line_id NULL and no LIVE settlement line naming it;
//                   reason "… settlement <doc> (historical backfill, printed on signed settlement)".
// WRITERS (engines only, one audit row each): voidSettlementDeduction (pending branch: record-only void, no money) and
// voidUnsettledDriverReimbursement (the one reimbursement void writer: status 'void', no money). Nothing posts.
// READ-BACK: the evidence re-selects 0 · 0 live pending seed-backfill orphan on these settlements' loads · the
// verify-no-duplicate-seed-deductions query finds 0 active duplicate groups on USMCA · one audit row per void · each of
// P-0098..P-0101 gross / deductions_total / reimbursements_total / net_pay unchanged and its settlement lines' md5 unchanged ·
// trial balance unchanged and 0.
//
//   default: DRY RUN in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) ·
//   --apply --auth LEAD-ORDER-443.197 (assertIsIntendedProduction) · --measure: selection only, in a READ ONLY transaction.
import { createHash } from "node:crypto";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { voidSettlementDeduction } from "../../apps/backend/src/driver-finance/settlement-deduction-void.service.ts";
import { voidUnsettledDriverReimbursement } from "../../apps/backend/src/driver-finance/driver-reimbursement-void.service.ts";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SETTLEMENTS = ["P-0098", "P-0099", "P-0100", "P-0101"];
const WINDOWS: Array<[string, string]> = [
  ["2026-10-16T15:02:00Z", "2026-10-16T15:06:00Z"],
  ["2026-10-16T15:29:00Z", "2026-10-16T15:34:00Z"],
];
const EXPECT_DEDUCTIONS = 22;
const EXPECT_REIMBURSEMENTS = 14;
const CROSS_CHECK_DEDUCTION_LOADS = ["13655", "13658", "13662", "13664"];
const REASON =
  "Lead 443.197: duplicate seed-run orphan (settlement backfill run twice 2026-10-16) — the signed settlement already carries this on its own lines";

const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] ?? "" : null; };
if (APPLY && arg("--auth") !== "LEAD-ORDER-443.197") throw new Error("--apply requires --auth LEAD-ORDER-443.197");
const MEASURE = process.argv.includes("--measure");
if (APPLY && FORK) throw new Error("--apply and --fork-commit are exclusive");
if (MEASURE && (APPLY || FORK)) throw new Error("--measure is read-only; it never combines with --apply / --fork-commit");
// verify-owner-authorization: Lead order 443.197 17:45Z (required-live-load-guard item 4).

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.197 void seed orphans" });
else if (FORK) await assertNotProduction(db, { label: "443.197 void seed orphans (fork)" });

const q = async <T = any>(sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows as T[];
const md5 = (x: unknown) => createHash("md5").update(JSON.stringify(x)).digest("hex");

// The signed settlements and the loads their lines carry.
const SETTLEMENT_LOADS_CTE = `
  sload AS (
    SELECT DISTINCT s.id AS settlement_id, s.display_id, s.source_document_ref AS doc, sl.load_id
      FROM driver_finance.driver_settlements s
      JOIN driver_finance.settlement_lines sl ON sl.settlement_id = s.id AND sl.load_id IS NOT NULL
     WHERE s.operating_company_id = $1::uuid AND s.display_id = ANY($2::text[]) AND s.voided_at IS NULL
  )`;
const IN_WINDOW = (col: string) => `((${col} >= $3::timestamptz AND ${col} < $4::timestamptz) OR (${col} >= $5::timestamptz AND ${col} < $6::timestamptz))`;
const PARAMS = [CO, SETTLEMENTS, ...WINDOWS.flat()];

const SELECT_DEDUCTIONS = `
  WITH ${SETTLEMENT_LOADS_CTE}
  SELECT d.id::text, l.load_number, sload.display_id, d.amount_cents::text
    FROM driver_finance.driver_settlement_deductions d
    JOIN sload ON sload.load_id = d.load_id
    JOIN mdata.loads l ON l.id = d.load_id
   WHERE d.operating_company_id = $1::uuid
     AND d.voided_at IS NULL AND d.status = 'pending' AND d.applied_to_settlement_id IS NULL
     AND COALESCE(d.remaining_balance_cents, d.amount_cents) = d.amount_cents
     AND (SELECT v.remaining_cents FROM driver_finance.v_settlement_deduction_balances v WHERE v.deduction_id = d.id) = d.amount_cents
     AND NOT EXISTS (SELECT 1 FROM driver_finance.settlement_lines x WHERE x.source_reference_id = d.id OR x.source_id = d.id)
     AND d.created_by_user_id = '${OWNER}'::uuid
     AND ${IN_WINDOW("d.created_at")}
     AND d.reason LIKE '% — settlement ' || sload.doc || ' (historical backfill)'
   ORDER BY l.load_number, d.created_at, d.id`;

const SELECT_REIMBURSEMENTS = `
  WITH ${SETTLEMENT_LOADS_CTE}
  SELECT r.id::text, l.load_number, sload.display_id, r.amount_cents::text
    FROM driver_finance.driver_reimbursements r
    JOIN sload ON sload.load_id = r.load_id
    JOIN mdata.loads l ON l.id = r.load_id
   WHERE r.operating_company_id = $1::uuid
     AND r.voided_at IS NULL AND r.status = 'pending' AND r.pay_mode = 'settlement'
     AND r.paid_at IS NULL AND r.journal_entry_id IS NULL AND r.applied_to_settlement_id IS NULL AND r.settlement_line_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM driver_finance.settlement_lines x JOIN driver_finance.driver_settlements xs ON xs.id = x.settlement_id
                      WHERE (x.source_reference_id = r.id OR x.source_id = r.id)
                        AND x.voided_at IS NULL AND COALESCE(x.is_active, true) AND xs.voided_at IS NULL)
     AND r.created_by_user_id = '${OWNER}'::uuid
     AND ${IN_WINDOW("r.created_at")}
     AND r.reason LIKE '%settlement ' || sload.doc || ' (historical backfill, printed on signed settlement)'
   ORDER BY l.load_number, r.created_at, r.id`;

// Any live pending seed-backfill orphan left on these settlements' loads (deduction or reimbursement), regardless of window.
const ORPHANS_LEFT = `
  WITH ${SETTLEMENT_LOADS_CTE}
  SELECT (SELECT count(*) FROM driver_finance.driver_settlement_deductions d JOIN sload ON sload.load_id = d.load_id
           WHERE d.operating_company_id = $1::uuid AND d.voided_at IS NULL AND d.status = 'pending' AND d.applied_to_settlement_id IS NULL
             AND d.reason LIKE '%(historical backfill%')::int AS deductions,
         (SELECT count(*) FROM driver_finance.driver_reimbursements r JOIN sload ON sload.load_id = r.load_id
           WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL AND r.status = 'pending' AND r.applied_to_settlement_id IS NULL
             AND r.reason LIKE '%(historical backfill%')::int AS reimbursements`;

// scripts/verify-no-duplicate-seed-deductions.mjs, live half — verbatim predicate.
const DUP_GROUPS = `
  SELECT l.load_number, d.deduction_type, d.amount_cents, count(*)::int AS n
    FROM driver_finance.driver_settlement_deductions d
    JOIN mdata.loads l ON l.id = d.load_id
   WHERE l.operating_company_id = $1 AND d.voided_at IS NULL
   GROUP BY d.load_id, l.load_number, d.deduction_type, d.amount_cents, d.reason
  HAVING count(*) > 1`;

const settlementState = async () => {
  const heads = await q(`SELECT id::text, display_id, status, gross_pay::text, deductions_total::text, reimbursements_total::text, net_pay::text,
          voided_at, posted_at, accounting_bill_id::text, accounting_bill_payment_id::text
     FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid AND display_id = ANY($2::text[]) ORDER BY display_id`, [CO, SETTLEMENTS]);
  const lines = await q(`SELECT sl.settlement_id::text, sl.id::text, sl.line_type, sl.amount::text, sl.quantity::text, sl.rate_cents, sl.load_id::text,
          sl.source_table, sl.source_reference_id::text, sl.source_id::text, sl.is_active, sl.voided_at, sl.posting_account_id::text, sl.approval_status
     FROM driver_finance.settlement_lines sl JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
    WHERE s.operating_company_id = $1::uuid AND s.display_id = ANY($2::text[]) ORDER BY sl.settlement_id, sl.id`, [CO, SETTLEMENTS]);
  return { heads, lines_md5: md5(lines), lines_n: lines.length };
};
const tb = async () => (await q<{ net: string }>(
  `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text net
     FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [CO]))[0].net;
const auditCount = async (eventClass: string, ids: string[]) => Number((await q<{ n: string }>(
  `SELECT count(*)::text n FROM audit.audit_events WHERE event_class = $1 AND payload->>'resource_id' = ANY($2::text[])`, [eventClass, ids]))[0].n);

let ok = false;
try {
  await db.query(MEASURE ? "BEGIN READ ONLY" : "BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [CO]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const mode = APPLY ? "APPLY (prod)" : FORK ? "FORK COMMIT" : MEASURE ? "MEASURE (read only)" : "DRY RUN (rolled back)";

  const deds = await q<{ id: string; load_number: string; display_id: string; amount_cents: string }>(SELECT_DEDUCTIONS, PARAMS);
  const reims = await q<{ id: string; load_number: string; display_id: string; amount_cents: string }>(SELECT_REIMBURSEMENTS, PARAMS);
  const by = (rows: { display_id: string }[]) => SETTLEMENTS.map((s) => `${s}:${rows.filter((r) => r.display_id === s).length}`).join(" ");
  const cents = (rows: { amount_cents: string }[]) => rows.reduce((s, r) => s + Number(r.amount_cents), 0);
  const dedLoads = [...new Set(deds.map((d) => d.load_number))].sort();
  console.log(`${mode} · selected by evidence: deductions ${deds.length} (${by(deds)}; ${cents(deds)}c; loads ${dedLoads.join(" ")}) · ` +
    `reimbursements ${reims.length} (${by(reims)}; ${cents(reims)}c)`);
  if (deds.length !== EXPECT_DEDUCTIONS || reims.length !== EXPECT_REIMBURSEMENTS)
    throw new Error(`REFUSE: selection ${deds.length} + ${reims.length} != ${EXPECT_DEDUCTIONS} + ${EXPECT_REIMBURSEMENTS} — re-measure before writing`);
  if (JSON.stringify(dedLoads) !== JSON.stringify(CROSS_CHECK_DEDUCTION_LOADS))
    throw new Error(`REFUSE: deduction loads ${dedLoads.join(" ")} differ from the cross-check ${CROSS_CHECK_DEDUCTION_LOADS.join(" ")}`);

  const s0 = await settlementState();
  if (MEASURE) {
    for (const h of s0.heads) console.log(`  ${h.display_id}: status ${h.status} · gross ${h.gross_pay} · deductions ${h.deductions_total} · reimbursements ${h.reimbursements_total} · net ${h.net_pay}`);
    console.log(`settlement lines ${s0.lines_n} md5 ${s0.lines_md5} · trial balance ${await tb()} · active duplicate deduction groups ${(await q(DUP_GROUPS, [CO])).length} · ` +
      `seed orphans on these loads ${JSON.stringify((await q(ORPHANS_LEFT, [CO, SETTLEMENTS]))[0])}`);
    await db.query("ROLLBACK");
    console.log("MEASURE — read only, nothing written.");
    ok = true;
  } else {
  const tb0 = await tb();
  const dupBefore = (await q(DUP_GROUPS, [CO])).length;
  const aD0 = await auditCount("driver_finance.settlement_deduction.voided", deds.map((d) => d.id));
  const aR0 = await auditCount("driver_finance.reimbursement.voided", reims.map((r) => r.id));

  for (const d of deds) {
    const res = await voidSettlementDeduction(db as never, { operating_company_id: CO, deduction_id: d.id, reason: REASON, actor_user_id: OWNER });
    if (res.outcome !== "voided_pending" || res.collected_cents !== 0 || res.journal_entry_id) throw new Error(`REFUSE deduction ${d.id}: outcome ${res.outcome}`);
  }
  for (const r of reims) {
    await voidUnsettledDriverReimbursement(db as never, { operating_company_id: CO, reimbursement_id: r.id, reason: REASON, actor_user_id: OWNER });
  }

  // Read-back.
  const againD = (await q(SELECT_DEDUCTIONS, PARAMS)).length;
  const againR = (await q(SELECT_REIMBURSEMENTS, PARAMS)).length;
  const left = (await q<{ deductions: number; reimbursements: number }>(ORPHANS_LEFT, [CO, SETTLEMENTS]))[0];
  const dupAfter = await q<{ load_number: string; n: number }>(DUP_GROUPS, [CO]);
  const voidedD = Number((await q<{ n: string }>(`SELECT count(*)::text n FROM driver_finance.driver_settlement_deductions
      WHERE id = ANY($1::uuid[]) AND voided_at IS NOT NULL AND void_reason = $2 AND voided_by_user_id = $3::uuid`, [deds.map((d) => d.id), REASON, OWNER]))[0].n);
  const voidedR = Number((await q<{ n: string }>(`SELECT count(*)::text n FROM driver_finance.driver_reimbursements
      WHERE id = ANY($1::uuid[]) AND status = 'void' AND voided_at IS NOT NULL AND void_reason = $2 AND voided_by_user_id = $3::uuid`, [reims.map((r) => r.id), REASON, OWNER]))[0].n);
  const aD1 = await auditCount("driver_finance.settlement_deduction.voided", deds.map((d) => d.id));
  const aR1 = await auditCount("driver_finance.reimbursement.voided", reims.map((r) => r.id));
  const s1 = await settlementState();
  const tb1 = await tb();

  console.log(`read-back: re-select ${againD} + ${againR} · seed orphans left on these loads ${left.deductions} + ${left.reimbursements} · ` +
    `active duplicate deduction groups on USMCA ${dupBefore} -> ${dupAfter.length} · voided ${voidedD}/${deds.length} + ${voidedR}/${reims.length} · ` +
    `audit +${aD1 - aD0} + ${aR1 - aR0}`);
  for (const h of s1.heads) {
    const b = s0.heads.find((x: any) => x.id === h.id);
    console.log(`  ${h.display_id}: gross ${b.gross_pay}->${h.gross_pay} · deductions ${b.deductions_total}->${h.deductions_total} · ` +
      `reimbursements ${b.reimbursements_total}->${h.reimbursements_total} · net ${b.net_pay}->${h.net_pay}`);
  }
  console.log(`settlement lines (${s0.lines_n}) md5 ${s0.lines_md5} -> ${s1.lines_md5} · trial balance ${tb0} -> ${tb1}`);
  if (againD || againR) throw new Error("NOT VERIFIED: the evidence still selects a row");
  if (left.deductions || left.reimbursements) throw new Error("NOT VERIFIED: a pending seed-backfill orphan remains on these settlements' loads");
  if (dupAfter.length) throw new Error(`NOT VERIFIED: verify-no-duplicate-seed-deductions would fail (${dupAfter.map((g) => g.load_number).join(" ")})`);
  if (voidedD !== deds.length || voidedR !== reims.length) throw new Error("NOT VERIFIED: not every selected row carries the void stamp");
  if (aD1 - aD0 !== deds.length || aR1 - aR0 !== reims.length) throw new Error("NOT VERIFIED: not one audit row per void");
  if (JSON.stringify(s0.heads) !== JSON.stringify(s1.heads)) throw new Error("NOT VERIFIED: a P-0098..P-0101 header moved");
  if (s0.lines_md5 !== s1.lines_md5) throw new Error("NOT VERIFIED: P-0098..P-0101 settlement lines changed");
  if (tb0 !== tb1 || Number(tb1) !== 0) throw new Error("NOT VERIFIED: trial balance moved or not 0");

  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log(`COMMITTED · ${deds.length} deductions + ${reims.length} reimbursements voided`);
  } else {
    await db.query("ROLLBACK");
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.197.");
  }
  ok = true;
  }
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 2000);
}

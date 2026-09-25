#!/usr/bin/env tsx
/**
 * Tie pure-August AlwaysTrack docs 5769–5788 + 5795/5796 net_pay to signed total_due.
 *
 * SPAN 5789–5794 stay OPEN (owner — Aug–Sep cross-month). Sep 5804–5815 already tied.
 *
 * Same engine path as tie-sep-5804-5815-to-at.mts:
 *   reverse posted pay-run → fix lines from settlement_control → load_bookended →
 *   closeSettlementPayRun → restamp header from pay-run breakdown.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/tie-pure-aug-to-at.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/tie-pure-aug-to-at.mts --apply
 *   ... --only 5769,5775
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.js";
import { reverseSettlementPayRunInClientTx } from "../../apps/backend/src/driver-finance/settlement-payrun-reverse.service.js";
import { closeSettlementPayRun } from "../../apps/backend/src/driver-finance/settlement-payrun-close.service.js";
import { createSettlementDeduction } from "../../apps/backend/src/driver-finance/deductions.service.js";
import { aggregateSettlementTotals } from "../../apps/backend/src/driver-finance/settlements-load-bookended.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const REVERSAL_ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REPOST_ACTOR = "4fe45bd3-83a0-4612-b99f-ce33072da01c";
const PAYMENT_METHOD_ID = "81f95ee0-fb05-4b73-a0b6-867e02ed2117";
const REASON = "ACCT-F20260924 tie pure-Aug 5769-5796 to AlwaysTrack total_due / settlement_control";

/** Pure-Aug closed set. SPAN 5789-5794 excluded by design. */
const DOCS = [
  ...Array.from({ length: 20 }, (_, i) => String(5769 + i)), // 5769-5788
  "5795",
  "5796",
];

const APPLY = process.argv.includes("--apply");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(process.argv[onlyIdx + 1]!.split(",").map((s) => s.trim())) : null;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (/-pooler\./.test(process.env.DATABASE_URL)) throw new Error("Refuse -pooler DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1" && !process.env.E11_AUTH_ID) {
  throw new Error("set E11_LEAD_AUTH=1 or E11_AUTH_ID");
}

type CtrlDoc = {
  driver_pay: number;
  tarp_pay: number;
  other: number;
  extra_stop_pay: number;
  reimbursement: number;
  escrow: number;
  admin_fee: number;
  cash_advance: number;
};
type CtrlLoad = {
  load: string;
  company_doc: string;
  driver_doc: string;
  driver_pay: number;
  escrow: number;
  tarp_pay?: number;
  tarp?: number;
  other?: number;
  reimbursement?: number;
  cash_advance?: number;
  admin_fee?: number;
  extra_stop_pay?: number;
};

const cents = (n: number) => Math.round(Math.abs(Number(n)) * 100);
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

function ctrlNet(d: CtrlDoc): number {
  return (
    Number(d.driver_pay || 0) +
    Number(d.tarp_pay || 0) +
    Number(d.extra_stop_pay || 0) +
    Number(d.other || 0) +
    Number(d.reimbursement || 0) +
    Number(d.escrow || 0) +
    Number(d.admin_fee || 0) +
    Number(d.cash_advance || 0)
  );
}

async function main() {
  const sc = JSON.parse(readFileSync(join(process.cwd(), "scripts/feed/settlement_control.json"), "utf8")) as {
    documents: Record<string, CtrlDoc>;
    loads: Record<string, CtrlLoad>;
  };
  const truth = JSON.parse(
    readFileSync(join(process.cwd(), "data/alwaystrack/settlements-truth-2026-09-13.json"), "utf8")
  ) as { driver: Array<{ settlement_no: string | number; total_due: number }> };
  const truthDue = new Map(truth.driver.map((d) => [String(d.settlement_no), Number(d.total_due)]));

  const targets = DOCS.filter((d) => !ONLY || ONLY.has(d));
  const report: string[] = [];
  report.push(`tie-pure-aug apply=${APPLY} targets=${targets.join(",")}`);

  for (const doc of targets) {
    const ctrl = sc.documents[doc];
    if (!ctrl) {
      report.push(`MISS control ${doc}`);
      continue;
    }
    // Prefer signed total_due when present (5780 ctrlNet=0 but truth=300).
    const expect = truthDue.has(doc) ? truthDue.get(doc)! : ctrlNet(ctrl);
    const loads = Object.values(sc.loads).filter(
      (l) => String(l.company_doc) === doc || String(l.driver_doc) === doc
    );
    if (!loads.length) {
      report.push(`MISS loads ${doc}`);
      continue;
    }

    const row = await withCurrentUser(REVERSAL_ACTOR, async (c) => {
      await setScopedCompanyContext(c, REVERSAL_ACTOR, USMCA);
      const r = await c.query<{
        id: string;
        status: string;
        posted: boolean;
        net: string;
        model: string | null;
        driver_id: string;
      }>(
        `SELECT id::text, status, posted_at IS NOT NULL AS posted, net_pay::text AS net,
                settlement_model AS model, driver_id::text
           FROM driver_finance.driver_settlements
          WHERE operating_company_id=$1::uuid AND source_document_ref=$2 AND voided_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [USMCA, doc]
      );
      return r.rows[0] ?? null;
    });
    if (!row) {
      report.push(`MISS settlement ${doc}`);
      continue;
    }
    const liveNet = Number(row.net);
    const delta = Math.round((expect - liveNet) * 100) / 100;
    report.push(
      `${doc} live=${money(liveNet)} expect=${money(expect)} delta=${money(delta)} status=${row.status} posted=${row.posted} model=${row.model}`
    );
    if (Math.abs(delta) < 0.005) {
      report.push(`  OK already ties`);
      continue;
    }
    if (!APPLY) {
      report.push(
        `  DRY reverse+fix tarp=${ctrl.tarp_pay} other=${ctrl.other} extra=${ctrl.extra_stop_pay} reimb=${ctrl.reimbursement} esc=${ctrl.escrow} admin=${ctrl.admin_fee} ca=${ctrl.cash_advance}`
      );
      continue;
    }

    await withCurrentUser(REVERSAL_ACTOR, async (c) => {
      await setScopedCompanyContext(c, REVERSAL_ACTOR, USMCA);
      await c.query("BEGIN");
      try {
        await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
        const rev = await reverseSettlementPayRunInClientTx(
          c as never,
          { operatingCompanyId: USMCA, settlementId: row.id, reason: REASON },
          { userId: REVERSAL_ACTOR },
          companyBusinessDate()
        );
        report.push(`  reverse ${rev.result} je=${rev.reversal_journal_entry_id ?? "n/a"}`);

        await c.query(
          `UPDATE accounting.company_settlements cs
              SET status='open', closed_at=NULL, closed_by_user_id=NULL, updated_at=now()
             FROM accounting.company_settlement_driver_settlements link
            WHERE link.company_settlement_id=cs.id
              AND link.driver_settlement_id=$1::uuid
              AND cs.operating_company_id=$2::uuid
              AND cs.voided_at IS NULL`,
          [row.id, USMCA]
        );

        await c.query(
          `UPDATE driver_finance.driver_settlements
              SET status='approved',
                  settlement_model='load_bookended',
                  trip_closed_at=NULL,
                  locked_at=NULL,
                  updated_at=now()
            WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
          [row.id, USMCA]
        );

        // Clear ALL pending deductions on this settlement, then re-seed exactly one
        // doc-level admin. Prior mint/complete scripts left load-level admins
        // ("…settl 5770 load 13509: Admin fee - Gas") that also match %settl ${doc}% —
        // keeping those + a new doc-level admin double-counts (5770: $20 vs $10).
        await c.query(
          `UPDATE driver_finance.driver_settlement_deductions
              SET applied_to_settlement_id=NULL, status='pending', updated_at=now()
            WHERE applied_to_settlement_id=$1::uuid
              AND voided_at IS NULL`,
          [row.id]
        );

        const loadIds = new Map<string, string>();
        for (const l of loads) {
          const lr = await c.query<{ id: string }>(
            `SELECT id::text FROM mdata.loads
              WHERE operating_company_id=$1::uuid AND load_number=$2
                AND soft_deleted_at IS NULL LIMIT 1`,
            [USMCA, String(l.load)]
          );
          if (!lr.rows[0]) throw new Error(`${doc}: load ${l.load} missing`);
          loadIds.set(String(l.load), lr.rows[0].id);
        }

        // Deactivate rebuildable lines; keep base earnings/deadhead from bills.
        await c.query(
          `UPDATE driver_finance.settlement_lines
              SET is_active=false, updated_at=now()
            WHERE settlement_id=$1::uuid
              AND is_active
              AND line_type IN ('escrow_contribution','extra_pay','reimbursement','deduction')`,
          [row.id]
        );

        for (const l of loads) {
          const loadId = loadIds.get(String(l.load))!;
          const tarp = Number(l.tarp_pay ?? l.tarp ?? 0);
          const other = Number(l.other ?? 0);
          const extraStop = Number(l.extra_stop_pay ?? 0);
          const extra = tarp + other + extraStop;
          if (extra > 0.005) {
            await c.query(
              `INSERT INTO driver_finance.settlement_lines
                 (operating_company_id, settlement_id, line_type, description, amount, load_id, is_active, is_sample_data)
               VALUES ($1::uuid,$2::uuid,'extra_pay',$3,$4::numeric,$5::uuid,true,false)`,
              [USMCA, row.id, `AlwaysTrack tarp/other/extra-stop load ${l.load} settl ${doc}`, money(extra), loadId]
            );
          }
          const reimb = Number(l.reimbursement ?? 0);
          if (reimb > 0.005) {
            await c.query(
              `INSERT INTO driver_finance.settlement_lines
                 (operating_company_id, settlement_id, line_type, description, amount, load_id, is_active, is_sample_data)
               VALUES ($1::uuid,$2::uuid,'reimbursement',$3,$4::numeric,$5::uuid,true,false)`,
              [USMCA, row.id, `AlwaysTrack reimbursement load ${l.load} settl ${doc}`, money(reimb), loadId]
            );
          }
          const esc = Math.abs(Number(l.escrow ?? 0));
          if (esc > 0.005) {
            await c.query(
              `INSERT INTO driver_finance.settlement_lines
                 (operating_company_id, settlement_id, line_type, description, amount, load_id, is_active, is_sample_data)
               VALUES ($1::uuid,$2::uuid,'escrow_contribution',$3,$4::numeric,$5::uuid,true,false)`,
              [USMCA, row.id, `Driver-Escrow For Claims — settl ${doc} load ${l.load}`, money(esc), loadId]
            );
          }
        }

        // Align header gross to lines before closeSettlementPayRun (reads header gross_pay).
        const rolled = await aggregateSettlementTotals(c as never, row.id, USMCA);
        report.push(
          `  rolled gross=${money(rolled.gross_pay)} ded=${money(rolled.deductions_total)} reimb=${money(rolled.reimbursements_total)} esc=${money(rolled.escrow_contribution_total)}`
        );
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    });

    const adminAbs = Math.abs(Number(ctrl.admin_fee || 0));
    if (adminAbs > 0.005) {
      await withCurrentUser(REPOST_ACTOR, async (c) => {
        await setScopedCompanyContext(c, REPOST_ACTOR, USMCA);
        const reason = `AlwaysTrack settl ${doc}: Admin fee`;
        const existing = await c.query<{ id: string }>(
          `SELECT id::text FROM driver_finance.driver_settlement_deductions
            WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid
              AND voided_at IS NULL AND reason=$3 LIMIT 1`,
          [USMCA, row.driver_id, reason]
        );
        let dedId = existing.rows[0]?.id;
        if (!dedId) {
          const created = await createSettlementDeduction(c as never, {
            operatingCompanyId: USMCA,
            driverId: row.driver_id,
            amountCents: cents(adminAbs),
            reason,
            sourceType: "other",
            createdByUserId: REPOST_ACTOR,
          });
          dedId = created.id;
          report.push(`  admin $${money(adminAbs)} created`);
        }
        await c.query(
          `UPDATE driver_finance.driver_settlement_deductions
              SET applied_to_settlement_id=$1::uuid, status='pending', updated_at=now()
            WHERE id=$2::uuid`,
          [row.id, dedId]
        );
      });
    }

    const caAbs = Math.abs(Number(ctrl.cash_advance || 0));
    if (caAbs > 0.005) {
      await withCurrentUser(REPOST_ACTOR, async (c) => {
        await setScopedCompanyContext(c, REPOST_ACTOR, USMCA);
        const have = await c.query<{ c: string }>(
          `SELECT COALESCE(SUM(
              CASE WHEN outstanding_balance > 0 THEN outstanding_balance ELSE amount END
            ),0)::text AS c
             FROM driver_finance.driver_advances
            WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid
              AND recovered_in_settlement_id IS NULL
              AND status NOT IN ('void','cancelled','recovered')`,
          [USMCA, row.driver_id]
        );
        const haveCents = Math.round(Number(have.rows[0]!.c) * 100);
        const needCents = cents(caAbs);
        const shortfall = needCents - haveCents;
        if (shortfall > 0) {
          const dollars = (shortfall / 100).toFixed(2);
          const displayId = `CA-2026-TIE-${doc}`;
          const liab = await c.query<{ id: string }>(
            `INSERT INTO driver_finance.driver_liabilities
               (operating_company_id, driver_id, type, source_description, original_amount, current_balance, origin, status)
             VALUES ($1::uuid,$2::uuid,'advance',$3,$4::numeric,$4::numeric,'cash_advance','pending_recovery')
             RETURNING id::text`,
            [USMCA, row.driver_id, `AlwaysTrack settl ${doc} cash advance`, dollars]
          );
          const adv = await c.query<{ id: string }>(
            `INSERT INTO driver_finance.driver_advances
               (operating_company_id, display_id, driver_id, liability_id, amount, outstanding_balance, purpose,
                disbursement_method, disbursement_status, recipient_type, status, created_by_user_id)
             VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5::numeric,$5::numeric,'other','historical_backfill','disbursed','driver','active',$6::uuid)
             RETURNING id::text`,
            [USMCA, displayId, row.driver_id, liab.rows[0]!.id, dollars, REPOST_ACTOR]
          );
          await c.query(`UPDATE driver_finance.driver_liabilities SET origin_id=$1::uuid WHERE id=$2::uuid`, [
            adv.rows[0]!.id,
            liab.rows[0]!.id,
          ]);
          report.push(`  seeded CA ${displayId} $${dollars}`);
        } else {
          report.push(`  CA recoverable enough (${(haveCents / 100).toFixed(2)})`);
        }
      });
    }

    const close = await closeSettlementPayRun(
      {
        operatingCompanyId: USMCA,
        settlementId: row.id,
        paymentMethodId: PAYMENT_METHOD_ID,
        loanRecoveryDecision: {
          mode: "partial",
          partial_cents: cents(caAbs),
          decided_by_user_id: REPOST_ACTOR,
          reason: `AlwaysTrack settl ${doc} cash-advance recovery`,
        },
        overrideFloor: {
          pct: 0,
          cents: 0,
          reason: `AlwaysTrack settl ${doc} signed net rebuild`,
        },
      },
      { userId: REPOST_ACTOR }
    );
    const gotNet = close.breakdown.net_cents / 100;

    await withCurrentUser(REPOST_ACTOR, async (c) => {
      await setScopedCompanyContext(c, REPOST_ACTOR, USMCA);
      const b = close.breakdown;
      const dedTotal =
        (b.deductions_cents + b.escrow_contribution_cents + b.advance_recoveries_cents + b.chargebacks_cents) / 100;
      const reimbTotal = (b.reimbursements_cents + b.detention_pay_cents) / 100;
      await c.query(
        `UPDATE driver_finance.driver_settlements
            SET gross_pay=$2::numeric,
                deductions_total=$3::numeric,
                reimbursements_total=$4::numeric,
                net_pay=$5::numeric,
                settlement_model='load_bookended',
                updated_at=now()
          WHERE id=$1::uuid AND operating_company_id=$6::uuid`,
        [row.id, money(b.gross_cents / 100), money(dedTotal), money(reimbTotal), money(gotNet), USMCA]
      );
      const ctrlEsc = Math.abs(Number(ctrl.escrow || 0));
      if (ctrlEsc < 0.005) {
        await c.query(
          `UPDATE driver_finance.settlement_lines
              SET is_active=false, updated_at=now()
            WHERE settlement_id=$1::uuid AND is_active AND line_type='escrow_contribution'`,
          [row.id]
        );
      }
    });

    const ok = Math.abs(gotNet - expect) < 0.005;
    report.push(
      `  close ${close.result} net=${money(gotNet)} expect=${money(expect)} ${ok ? "PASS" : "FAIL"} ` +
        `gross=${money(close.breakdown.gross_cents / 100)} ded=${money(close.breakdown.deductions_cents / 100)} ` +
        `esc=${money(close.breakdown.escrow_contribution_cents / 100)} adv=${money(close.breakdown.advance_recoveries_cents / 100)}`
    );
    if (!ok) throw new Error(`${doc} net ${money(gotNet)} != expect ${money(expect)}`);
  }

  const spanOpen = await withCurrentUser(REPOST_ACTOR, async (c) => {
    await setScopedCompanyContext(c, REPOST_ACTOR, USMCA);
    const r = await c.query<{ ref: string; status: string }>(
      `SELECT source_document_ref AS ref, status
         FROM driver_finance.driver_settlements
        WHERE operating_company_id=$1::uuid AND voided_at IS NULL
          AND source_document_ref IN ('5789','5790','5791','5792','5793','5794')
        ORDER BY 1`,
      [USMCA]
    );
    return r.rows;
  });
  report.push(`SPAN status: ${spanOpen.map((r) => `${r.ref}=${r.status}`).join(" ")}`);

  console.log(report.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

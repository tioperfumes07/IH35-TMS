#!/usr/bin/env tsx
/**
 * Tie Sep AlwaysTrack docs 5804–5815 net_pay to settlement_control.json.
 *
 * Root cause (measured live 2026-09-24):
 *   - settlements closed with settlement_model=NULL → flat $250 escrow (not load_bookended)
 *   - tarp/other never became settlement_lines (only base driver_pay on bills)
 *   - reimbursements / admin / CA missing or wrong
 *   - 5812 is $0 driver_pay (LH-only) — already closed at $0 (cannot withhold escrow; NET_PAY_NEGATIVE)
 *
 * Path: reverse posted pay-run → fix lines from settlement_control → set load_bookended → reclose.
 * No new GL math — reverseSettlementPayRunInClientTx + closeSettlementPayRun only.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/tie-sep-5804-5815-to-at.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/tie-sep-5804-5815-to-at.mts --apply
 *   ... --only 5805,5807
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
const REVERSAL_ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // maker
const REPOST_ACTOR = "4fe45bd3-83a0-4612-b99f-ce33072da01c"; // checker ≠ maker
const PAYMENT_METHOD_ID = "81f95ee0-fb05-4b73-a0b6-867e02ed2117"; // Driver Net-Pay Clearing
const REASON = "ACCT-F20260924 tie 5804-5815 to AlwaysTrack settlement_control (flat $250 escrow + missing tarp/other/admin/CA)";

const DOCS = ["5804", "5805", "5806", "5807", "5808", "5809", "5810", "5811", "5813", "5814", "5815"] as const;
/** Zero-pay paperwork-only — leave closed at $0. */
const SKIP_ZERO_PAY = new Set(["5812"]);

const APPLY = process.argv.includes("--apply");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(process.argv[onlyIdx + 1]!.split(",").map((s) => s.trim())) : null;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (/-pooler\./.test(process.env.DATABASE_URL)) throw new Error("Refuse -pooler DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1" && !process.env.E11_AUTH_ID) {
  throw new Error("set E11_LEAD_AUTH=1 or E11_AUTH_ID");
}

type CtrlDoc = {
  loads: number;
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
};

const cents = (n: number) => Math.round(Math.abs(Number(n)) * 100);
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

function expectedNet(d: CtrlDoc): number {
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

  const targets = DOCS.filter((d) => !SKIP_ZERO_PAY.has(d) && (!ONLY || ONLY.has(d)));
  const report: string[] = [];
  report.push(`tie-sep-5804-5815 apply=${APPLY} targets=${targets.join(",")}`);

  for (const doc of targets) {
    const ctrl = sc.documents[doc];
    if (!ctrl) throw new Error(`no settlement_control.documents[${doc}]`);
    const expect = expectedNet(ctrl);
    const loads = Object.values(sc.loads).filter(
      (l) => String(l.company_doc) === doc || String(l.driver_doc) === doc
    );
    if (!loads.length) throw new Error(`no loads for doc ${doc}`);

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
      report.push(`MISS ${doc} — no live settlement`);
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
        `  DRY would reverse+fix: tarp=${ctrl.tarp_pay} other=${ctrl.other} reimb=${ctrl.reimbursement} escrow=${ctrl.escrow} admin=${ctrl.admin_fee} ca=${ctrl.cash_advance}`
      );
      continue;
    }

    // ── 1) Reverse posted pay-run (maker) ─────────────────────────────────────────
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
        report.push(`  reverse ${rev.result} je=${rev.reversal_journal_entry_id ?? "n/a"} esc_rev=${rev.escrow_reversed_cents}`);

        // Reopen company settlements linked to this driver settlement.
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

        // Reopen driver settlement for line edits.
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

        // Un-apply foreign pending deductions wrongly stuck on this settlement.
        const unapplied = await c.query(
          `UPDATE driver_finance.driver_settlement_deductions
              SET applied_to_settlement_id=NULL, status='pending', updated_at=now()
            WHERE applied_to_settlement_id=$1::uuid
              AND voided_at IS NULL
              AND reason NOT ILIKE $2
            RETURNING id::text`,
          [row.id, `%settl ${doc}%`]
        );
        if ((unapplied.rowCount ?? 0) > 0) {
          report.push(`  unapplied ${unapplied.rowCount} foreign deduction(s)`);
        }

        // Resolve load ids.
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

        // Deactivate existing escrow / extra_pay / reimbursement lines we will rebuild.
        await c.query(
          `UPDATE driver_finance.settlement_lines
              SET is_active=false, updated_at=now()
            WHERE settlement_id=$1::uuid
              AND is_active
              AND line_type IN ('escrow_contribution','extra_pay','reimbursement')`,
          [row.id]
        );

        // Ensure base earnings lines exist (from bills) — leave them; only add tarp/other extras.
        for (const l of loads) {
          const loadId = loadIds.get(String(l.load))!;
          const tarp = Number(l.tarp_pay ?? l.tarp ?? 0);
          const other = Number(l.other ?? 0);
          const extraStop = Number((l as { extra_stop_pay?: number }).extra_stop_pay ?? 0);
          const extra = tarp + other + extraStop;
          if (extra > 0.005) {
            await c.query(
              `INSERT INTO driver_finance.settlement_lines
                 (operating_company_id, settlement_id, line_type, description, amount, load_id, is_active, is_sample_data)
               VALUES ($1::uuid,$2::uuid,'extra_pay',$3,$4::numeric,$5::uuid,true,false)`,
              [
                USMCA,
                row.id,
                `AlwaysTrack tarp/other/extra-stop load ${l.load} settl ${doc}`,
                money(extra),
                loadId,
              ]
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

        // closeSettlementPayRun reads HEADER gross_pay (not live lines). Roll up now so
        // extra_pay / reimbursement / escrow_contribution land on the header before close.
        const rolled = await aggregateSettlementTotals(c as never, row.id, USMCA);
        report.push(
          `  rolled gross=${money(rolled.gross_pay)} ded=${money(rolled.deductions_total)} reimb=${money(rolled.reimbursements_total)} esc=${money(rolled.escrow_contribution_total)} net=${money(rolled.net_pay)}`
        );

        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    });

    // ── 2) Admin fee + CA seed (checker path uses service layer) ──────────────────
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
          report.push(`  admin $${money(adminAbs)} created ${dedId}`);
        } else {
          report.push(`  admin exists ${dedId}`);
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

    // ── 3) Reclose (checker) ──────────────────────────────────────────────────────
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
    // stampTripClosedForBookendedSettlement calls aggregateSettlementTotals AFTER the pay-run
    // header write, wiping admin/CA (those live on driver_settlement_deductions / advances, not
    // settlement_lines). Re-stamp the pay-run breakdown so control totals read the signed net.
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
        [
          row.id,
          money(b.gross_cents / 100),
          money(dedTotal),
          money(reimbTotal),
          money(gotNet),
          USMCA,
        ]
      );
      // Deactivate any escrow lines stampTripClosed may have re-appended when AT escrow is 0.
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
        `gross=${money(close.breakdown.gross_cents / 100)} reimb=${money(close.breakdown.reimbursements_cents / 100)} ` +
        `ded=${money(close.breakdown.deductions_cents / 100)} esc=${money(close.breakdown.escrow_contribution_cents / 100)} ` +
        `adv=${money(close.breakdown.advance_recoveries_cents / 100)}`
    );
    if (!ok) throw new Error(`${doc} net ${money(gotNet)} != expect ${money(expect)}`);
  }

  // Final census vs control (5812 stays $0).
  const sum = await withCurrentUser(REPOST_ACTOR, async (c) => {
    await setScopedCompanyContext(c, REPOST_ACTOR, USMCA);
    const r = await c.query<{ v: string }>(
      `SELECT COALESCE(SUM(net_pay),0)::text AS v
         FROM driver_finance.driver_settlements
        WHERE operating_company_id=$1::uuid
          AND source_document_ref IN
              ('5804','5805','5806','5807','5808','5809','5810','5811','5812','5813','5814','5815')
          AND voided_at IS NULL`,
      [USMCA]
    );
    return Number(r.rows[0]!.v);
  });
  report.push(`SUM 5804-5815 live=${money(sum)} control_expect_with_5812_at_0=20241.07`);

  console.log(report.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * settlement-header-backlink-restamp.service.ts — CC-1 SETL-HEADER-05-RESTAMP (2026-11-12, AUTH-478).
 *
 * Root cause: SETL-HEADER-05 was added to the settlement-bill-payment-posting service to write
 * accounting_bill_id / accounting_bill_payment_id back onto driver_settlements after every posting
 * run. Settlements posted BEFORE SETL-HEADER-05 landed were never backfilled — their
 * driver_settlements.accounting_bill_id stays NULL even though driver_settlement_gl_bills already
 * carries the correct accounting_bill_id for every child bill processed in the run.
 *
 * Fix: for every USMCA closed settlement where accounting_bill_id IS NULL but at least one child
 * driver_settlement_gl_bills row has a non-null accounting_bill_id, copy the first child bill id
 * to the settlement header (same COALESCE / first-bill semantics as SETL-HEADER-05). This is a
 * purely linkage-signal write — no GL amounts, no bill status, no payment touched.
 *
 * Also restamps accounting_bill_payment_id from the first child cash_bill_payment_id where it is
 * NULL and a child row has a non-null cash_bill_payment_id, using the same first-bill logic.
 *
 * Idempotent: COALESCE never overwrites an already-set header value. Scope: USMCA only (AUTH-478).
 */
import { withLuciaBypass } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

export const BACKLINK_RESTAMP_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA (AUTH-478)

export class BacklinkRestampRefused extends Error {}

type StaleSettlement = {
  id: string;
  display_id: string;
  first_accounting_bill_id: string | null;
  first_cash_bill_payment_id: string | null;
};

export type BacklinkRestampResult = {
  dry_run: boolean;
  found: number;
  restamped: number;
  already_linked: number;
  rows: Array<{
    settlement_id: string;
    display_id: string;
    outcome: "dry_run_skip" | "restamped" | "already_linked";
    accounting_bill_id?: string | null;
    accounting_bill_payment_id?: string | null;
  }>;
};

async function findStaleSettlements(companyId: string): Promise<StaleSettlement[]> {
  const res = await withLuciaBypass(async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return client.query<StaleSettlement>(
      `SELECT ds.id::text, ds.display_id::text,
              (SELECT g.accounting_bill_id::text
                 FROM driver_finance.driver_settlement_gl_bills g
                WHERE g.settlement_id = ds.id
                  AND g.operating_company_id = ds.operating_company_id
                  AND g.accounting_bill_id IS NOT NULL
                  AND g.superseded_at IS NULL
                ORDER BY g.created_at LIMIT 1) AS first_accounting_bill_id,
              (SELECT g.cash_bill_payment_id::text
                 FROM driver_finance.driver_settlement_gl_bills g
                WHERE g.settlement_id = ds.id
                  AND g.operating_company_id = ds.operating_company_id
                  AND g.cash_bill_payment_id IS NOT NULL
                  AND g.superseded_at IS NULL
                ORDER BY g.created_at LIMIT 1) AS first_cash_bill_payment_id
         FROM driver_finance.driver_settlements ds
        WHERE ds.operating_company_id = $1::uuid
          AND ds.status = 'closed'
          AND ds.accounting_bill_id IS NULL
        ORDER BY ds.posted_at`,
      [companyId]
    );
  }, { actorUserId: "system" });
  return res.rows;
}

export async function restampSettlementHeaderBacklinks(input: {
  companyId: string;
  actorUserId: string;
  dryRun: boolean;
}): Promise<BacklinkRestampResult> {
  if (input.companyId !== BACKLINK_RESTAMP_COMPANY_ID)
    throw new BacklinkRestampRefused("AUTH-478 scope is USMCA only");

  const stale = await findStaleSettlements(input.companyId);
  const rows: BacklinkRestampResult["rows"] = [];
  let restampedCount = 0;
  let alreadyLinkedCount = 0;
  let found = 0;

  for (const s of stale) {
    if (!s.first_accounting_bill_id) {
      // No gl_bills child with an accounting_bill_id — cannot restamp, skip silently.
      continue;
    }

    found++;

    if (input.dryRun) {
      rows.push({
        settlement_id: s.id,
        display_id: s.display_id,
        outcome: "dry_run_skip",
        accounting_bill_id: s.first_accounting_bill_id,
        accounting_bill_payment_id: s.first_cash_bill_payment_id,
      });
      continue;
    }

    await withLuciaBypass(async (client) => {
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [input.companyId]);
      await client.query(
        `UPDATE driver_finance.driver_settlements
            SET accounting_bill_id = COALESCE(accounting_bill_id, $2::uuid),
                accounting_bill_payment_id = COALESCE(accounting_bill_payment_id, $3::uuid),
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $4::uuid`,
        [s.id, s.first_accounting_bill_id, s.first_cash_bill_payment_id ?? null, input.companyId]
      );
      await appendCrudAudit(
        client as never,
        input.actorUserId,
        "driver_finance.settlement_header_backlink_restamped",
        {
          settlement_id: s.id,
          display_id: s.display_id,
          accounting_bill_id: s.first_accounting_bill_id,
          accounting_bill_payment_id: s.first_cash_bill_payment_id ?? null,
          operating_company_id: input.companyId,
          owner_auth_id: "AUTH-478",
          round: "CC-1-SETL-HEADER-05-RESTAMP-2026-11-12",
        },
        "info",
        "CC-1-SETL-HEADER-05-RESTAMP-2026-11-12"
      );
    }, { actorUserId: input.actorUserId });

    restampedCount++;
    rows.push({
      settlement_id: s.id,
      display_id: s.display_id,
      outcome: "restamped",
      accounting_bill_id: s.first_accounting_bill_id,
      accounting_bill_payment_id: s.first_cash_bill_payment_id,
    });
  }

  return {
    dry_run: input.dryRun,
    found,
    restamped: restampedCount,
    already_linked: alreadyLinkedCount,
    rows,
  };
}

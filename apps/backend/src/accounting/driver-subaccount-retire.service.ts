// 443.53 #4: retire a driver profile's escrow + advance sub-accounts that never carried a posting.
//
// The reverse of driver-subaccount-provision: for every escrow link (accounting.escrow_accounts, holder_type 'driver') and
// advance link (driver_finance.driver_advance_accounts) the driver holds, count the GL postings on its catalogs.accounts row.
//   0 postings -> the account is deactivated exactly as POST /api/v1/catalogs/accounts/:id/deactivate does (deactivated_at,
//                 audit "catalogs.accounts.deactivated", TMS account push), and the link is closed (escrow status 'closed',
//                 advance is_active false). Nothing is deleted; history is kept.
//   any posting -> listed and left untouched (a posted account is money, not a test artifact).
// A locked account is never deactivated (the route answers 423 for it too).
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueTmsAccountPushRequested } from "../qbo/tms-account-push-chain.service.js";

export type DriverSubAccountRetireRow = {
  kind: "escrow" | "advance";
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  postings: number;
  balance_cents: number;
  outcome: "retired" | "already_retired" | "kept_has_postings" | "kept_locked";
};

export async function retireDriverSubAccountsWithoutPostings(
  client: PoolClient,
  input: { companyId: string; driverId: string; actorUserId: string }
): Promise<DriverSubAccountRetireRow[]> {
  const links = (
    await client.query<{ kind: "escrow" | "advance"; link_id: string; account_id: string; account_number: string | null; account_name: string | null; deactivated_at: string | null; is_locked: boolean | null; postings: number; balance_cents: number }>(
      `WITH l AS (
         SELECT 'escrow'::text kind, e.id::text link_id, e.coa_account_id FROM accounting.escrow_accounts e
          WHERE e.operating_company_id = $1::uuid AND e.holder_type = 'driver' AND e.holder_id = $2::uuid
         UNION ALL
         SELECT 'advance', v.driver_id::text, v.coa_account_id FROM driver_finance.driver_advance_accounts v
          WHERE v.operating_company_id = $1::uuid AND v.driver_id = $2::uuid)
       SELECT l.kind, l.link_id, a.id::text account_id, a.account_number, a.account_name, a.deactivated_at, a.is_locked,
              (SELECT count(*) FROM accounting.journal_entry_postings p WHERE p.account_id = a.id)::int postings,
              (SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)
                 FROM accounting.journal_entry_postings p WHERE p.account_id = a.id)::bigint::float8 balance_cents
         FROM l JOIN catalogs.accounts a ON a.id = l.coa_account_id AND a.operating_company_id = $1::uuid
        ORDER BY l.kind, a.account_number`,
      [input.companyId, input.driverId]
    )
  ).rows;

  const out: DriverSubAccountRetireRow[] = [];
  for (const r of links) {
    const base = { kind: r.kind, account_id: r.account_id, account_number: r.account_number, account_name: r.account_name, postings: r.postings, balance_cents: r.balance_cents };
    if (r.postings > 0) { out.push({ ...base, outcome: "kept_has_postings" }); continue; }
    if (r.is_locked === true) { out.push({ ...base, outcome: "kept_locked" }); continue; }
    const wasAlreadyDeactivated = r.deactivated_at !== null;
    if (!wasAlreadyDeactivated) {
      await client.query(
        `UPDATE catalogs.accounts SET deactivated_at = now(), updated_by_user_id = $2 WHERE id = $1::uuid AND deactivated_at IS NULL`,
        [r.account_id, input.actorUserId]
      );
    }
    if (r.kind === "escrow") {
      await client.query(`UPDATE accounting.escrow_accounts SET status = 'closed', updated_at = now() WHERE id = $1::uuid AND status <> 'closed'`, [r.link_id]);
    } else {
      await client.query(
        `UPDATE driver_finance.driver_advance_accounts SET is_active = false, updated_at = now(), updated_by_user_id = $3::uuid
          WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid AND coa_account_id = $4::uuid AND is_active`,
        [input.companyId, input.driverId, input.actorUserId, r.account_id]
      );
    }
    await appendCrudAudit(client as never, input.actorUserId, "catalogs.accounts.deactivated", {
      resource_id: r.account_id,
      resource_type: "catalogs.accounts",
      was_already_deactivated: wasAlreadyDeactivated,
      reason: "driver_subaccount_never_posted",
      driver_id: input.driverId,
      link_kind: r.kind,
    });
    await enqueueTmsAccountPushRequested(client as never, { operating_company_id: input.companyId, account_id: r.account_id, operation: "update" });
    out.push({ ...base, outcome: wasAlreadyDeactivated ? "already_retired" : "retired" });
  }
  return out;
}

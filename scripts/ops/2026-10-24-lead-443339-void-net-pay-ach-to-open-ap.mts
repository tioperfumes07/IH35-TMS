/**
 * LEAD 443.339 — owner ruling R12 (2026-10-11): a settlement's NET driver pay stays OPEN on Accounts Payable; the payment is
 * born when the owner matches the real bank line in Banking. Today's ENG-01 posts (P-0113, P-0117, P-0119) and the 13699
 * close (P-0120) went through postLoadBookendedSettlementGlAfterClose WITHOUT leaveNetOpen, so each wrote an ACH bill payment
 * "net driver pay" crediting 1000 Bank of America with no bank line behind it ($2,772.61, unmatched).
 * Void exactly those five through the ONE bill-payment void (voidBillPaymentInClientTx — reverses Dr 2000 / Cr 1000, the
 * driver bill returns to open on A/P) and label the settlement pay_method 'open_ap_unpaid' like the other 81 closed ones.
 * Refuses unless each payment is still posted, ACH, from BofA operating, 'net driver pay', and matched to NO bank line.
 * Dry run by default (transaction rolled back); --apply + OWNER_AUTH_ID commits.
 */
import { withLuciaBypass } from "../../apps/backend/src/auth/db.ts";
import { voidBillPaymentInClientTx } from "../../apps/backend/src/accounting/bills.service.ts";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.ts";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const BOFA = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const PAYMENTS: Record<string, string> = {
  "270a8152-9df5-4469-ad41-7291115b64c3": "P-0113",
  "f3994437-1c01-4a4e-87d7-a948911f36ce": "P-0113",
  "0311d68d-d295-4e9b-a052-b4442548d9ca": "P-0117",
  "09f60e83-a582-4947-b5b7-c863dd9602bc": "P-0119",
  "34920bb5-2263-4c17-8bb8-dafb35cee1ef": "P-0120",
};
const COMMIT = process.argv.includes("--apply");
const AUTH = process.env.OWNER_AUTH_ID ?? "";
if (COMMIT && !/^AUTH-[0-9]+$/.test(AUTH)) throw new Error("--apply requires OWNER_AUTH_ID=AUTH-NNN");
if (COMMIT) {
  // The owner's authorization must be on record (docs/bus/OWNER-AUTHORIZATIONS.md) before any production write.
  const { execFileSync } = await import("node:child_process");
  const nodePath = await import("node:path");
  const ROOT = nodePath.resolve(nodePath.dirname(new URL(import.meta.url).pathname), "../..");
  try { execFileSync("node", [nodePath.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH], { stdio: "inherit" }); } catch { process.exit(1); }
}
const REASON = `443.339 R12: net driver pay stays open on A/P until the owner matches the real bank line (posted without a bank line by the clearing path)${AUTH ? " " + AUTH : ""}`;
class Rollback extends Error { constructor(public p: unknown) { super("dry-run"); } }
type Q = { query: (s: string, v?: unknown[]) => Promise<{ rows: Record<string, any>[]; rowCount?: number | null }> };

try {
  const out = await withLuciaBypass(async (client) => {
    const c = client as unknown as Q;
    await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [CO]);
    const tb = async () => (await c.query(
      `SELECT sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::text AS tb,
              sum(CASE WHEN a.account_number='1000' THEN CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END ELSE 0 END)::text AS bank_1000,
              sum(CASE WHEN a.account_number='2000' THEN CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END ELSE 0 END)::text AS ap_2000
         FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id WHERE p.operating_company_id = $1::uuid`, [CO])).rows[0];
    const before = await tb();
    const voided: unknown[] = [];
    for (const [id, settlement] of Object.entries(PAYMENTS)) {
      const bp = (await c.query(
        `SELECT bp.id::text, bp.status, bp.payment_method, bp.from_bank_account_id::text, bp.memo, bp.amount_cents, bp.revoked_at,
                (SELECT count(*) FROM banking.bank_transactions bt WHERE bt.matched_bill_payment_id = bp.id AND bt.voided_at IS NULL)::int AS bank_matches
           FROM accounting.bill_payments bp WHERE bp.id = $1::uuid AND bp.operating_company_id = $2::uuid FOR UPDATE`, [id, CO])).rows[0];
      if (!bp) throw new Error(`${id} not found`);
      if (bp.revoked_at || bp.status !== "posted" || bp.payment_method !== "ach" || bp.from_bank_account_id !== BOFA
          || !String(bp.memo).startsWith(`Settlement ${settlement} — net driver pay`) || bp.bank_matches !== 0) {
        throw new Error(`${id} (${settlement}) is not an unmatched posted ACH net-pay payment — refusing: ${JSON.stringify(bp)}`);
      }
      await voidBillPaymentInClientTx(client as never, { operatingCompanyId: CO, paymentId: id, reason: REASON, userId: ACTOR, currentBusinessDate: companyBusinessDate() });
      voided.push({ id, settlement, amount: Number(bp.amount_cents) / 100 });
    }
    const upd = await c.query(
      `UPDATE driver_finance.driver_settlements SET pay_method = 'open_ap_unpaid', updated_at = now()
        WHERE operating_company_id = $1::uuid AND display_id = ANY($2::text[]) AND pay_method = 'Driver Net-Pay Clearing'`,
      [CO, [...new Set(Object.values(PAYMENTS))]]);
    const after = await tb();
    if (after.tb !== "0") throw new Error(`TB not zero after: ${after.tb}`);
    const payload = { mode: COMMIT ? `COMMIT ${AUTH}` : "DRY RUN (ROLLED BACK)", voided, settlements_relabelled: upd.rowCount, before, after };
    if (!COMMIT) throw new Rollback(payload);
    return payload;
  });
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  if (e instanceof Rollback) console.log(JSON.stringify(e.p, null, 2));
  else { console.error("REFUSED/ERROR:", (e as Error).message); process.exit(1); }
}
process.exit(0);

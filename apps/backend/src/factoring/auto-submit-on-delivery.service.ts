/**
 * FACT-DELIVERED-AUTO (owner ruling 2026-09-09, verbatim: "ALL DOCS ARE IN ALWAYS. THE DELIVERED,
 * SHOULD ALREADY HAVE GONE TO FACTORING MODULE ... AND SHOULD HAVE ALREADY CREATED THE PURCHASES.
 * SHOULD HAVE API FOR DELIVERED"). McLeod/Alvys parity: when a load reaches a delivery-evidence
 * status and its customer invoice is SENT, if the customer is assigned to a factor the "purchase"
 * (an accounting.factoring_advances row) is auto-created in status='submitted' and the invoice is
 * linked — the identical state the manual Submit-to-Factor flow (POST /accounting/factoring-advances)
 * produces.
 *
 * WHY SUBMIT, NOT FUND, AT DELIVERY (the correct method): under the executed Faro FULL-RECOURSE
 * secured-borrowing agreement the funding journal entry (Dr cash/reserve/fee, Cr factoring-advance
 * liability) posts at ACTUAL funding using Faro's real funded figures — the existing
 * POST /accounting/factoring-advances/:id/advance + faro-csv-import path. Auto-posting a funding JE
 * the instant a load delivers, before Faro has wired a cent, would book cash that does not exist.
 * So this trigger reuses the create/submit primitives ONLY and NEVER calls the GL poster
 * (postFactoringAdvanceEvent). Funding stays a funding-time event. The advance appears immediately on
 * the factoring board as a submitted purchase, which is exactly what the owner asked to see.
 *
 * WHERE IT RUNS: AFTER the delivery transaction commits, on its own scoped connection
 * (withCompanyScope). The factoring create/advance path learned the hard way (ACCT-F5651) that it
 * must not share a transaction/lock with another writer; running after-commit on a fresh connection
 * removes any lock-order conflict by construction.
 *
 * IDEMPOTENT: refuses an invoice that is not 'sent', already carries a non-'not_factored'
 * factoring_status, is ineligible, or has zero open AR — so a re-fired delivery latch, a retry, or a
 * manual submit that already ran is a clean no-op that never double-books a purchase.
 *
 * GATE: the customer must be assigned to a factor (factoring.customer_factor_assignment, resolved by
 * getFactorForCustomer) AND the operating company must have a live canonical Faro agreement
 * (resolveCanonicalActiveFactor). Both are owner-controlled data, so factor assignment IS the switch
 * (per Rule 50 there is no OFF flag state for USMCA money; the owner turns this on/off per customer).
 */
import { withCompanyScope, INVOICE_PLEDGE_CENTS_SQL } from "../accounting/shared.js";
// (INVOICE_PLEDGE_CENTS_SQL is the shared open-AR pledge base — same one the manual create route uses.)
import { nextFactoringDisplayId } from "../accounting/display-id.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { getFactorForCustomer } from "./factor.service.js";
import { resolveCanonicalActiveFactor } from "../home/factoring-balance-invoice-linkage.service.js";

export type AutoSubmitInput = {
  operatingCompanyId: string;
  loadId: string;
  actorUserId: string;
};

export type AutoSubmitResult = {
  submitted: boolean;
  reason?: string;
  advanceId?: string;
  displayId?: string;
};

/**
 * FACT-RESERVE-01 secured-borrowing split — reserve and fee are each computed INDEPENDENTLY from
 * their own executed-agreement percentage, and the advance (purchase price) is the complement, never
 * a caller-supplied third number that could drift. Mirrors the create route's inline math exactly;
 * the GL legs themselves are never computed here (funding posts later through the shared poster).
 */
export function computeFactoringSubmitAmounts(pledgeCents: number, reservePct: number, feePct: number) {
  const reserveAmount = Math.round((pledgeCents * reservePct) / 100);
  const feeAmount = Math.round((pledgeCents * feePct) / 100);
  const advanceAmount = pledgeCents - reserveAmount - feeAmount;
  const advanceRatePct = pledgeCents > 0 ? Number(((advanceAmount / pledgeCents) * 100).toFixed(2)) : 0;
  return { reserveAmount, feeAmount, advanceAmount, advanceRatePct };
}

/**
 * Auto-submit the delivered load's sent, factor-assigned invoice to its factor as a submitted advance
 * (purchase). Never throws — swallow-and-log to match the revenue latch: a factoring hiccup must
 * never 500 a driver's "I delivered" tap.
 */
export async function autoSubmitDeliveredLoadToFactor(input: AutoSubmitInput): Promise<AutoSubmitResult> {
  try {
    return await withCompanyScope(input.actorUserId, input.operatingCompanyId, async (client) => {
      const oci = input.operatingCompanyId;
      const invRes = await client.query(
        `
          SELECT
            i.id,
            i.customer_id,
            (${INVOICE_PLEDGE_CENTS_SQL})::bigint AS pledge_cents,
            i.status,
            COALESCE(i.factoring_status, 'not_factored') AS factoring_status,
            COALESCE(c.factoring_eligible, c2.factoring_eligible) AS factoring_eligible
          FROM accounting.invoices i
          LEFT JOIN mdata.customers c
            ON c.id = i.customer_id AND c.operating_company_id = i.operating_company_id
          LEFT JOIN LATERAL (
            SELECT * FROM mdata.get_customer_same_company(i.customer_id, i.operating_company_id)
            WHERE c.id IS NULL
          ) c2 ON true
          WHERE i.operating_company_id = $1::uuid
            AND i.source_load_id = $2::uuid
            AND i.voided_at IS NULL
          ORDER BY i.created_at DESC
          LIMIT 1
        `,
        [oci, input.loadId]
      );
      const inv = invRes.rows[0] as Record<string, unknown> | undefined;
      if (!inv) return { submitted: false, reason: "no_invoice_for_load" };
      // Idempotency + eligibility — identical gate to the manual create route.
      if (String(inv.status) !== "sent") return { submitted: false, reason: "invoice_not_sent" };
      if (String(inv.factoring_status) !== "not_factored") return { submitted: false, reason: "invoice_already_factored" };
      if (!inv.factoring_eligible) return { submitted: false, reason: "customer_not_factoring_eligible" };
      const pledgeCents = Number(inv.pledge_cents ?? 0);
      if (pledgeCents <= 0) return { submitted: false, reason: "invoice_zero_open" };

      const asOf = companyBusinessDate();
      // Per-customer factor assignment is the gate AND the executed rate source (validated to match
      // the canonical agreement by resolveCanonicalActiveFactor below).
      const factor = await getFactorForCustomer(oci, String(inv.customer_id), asOf, { client });
      if (!factor) return { submitted: false, reason: "customer_not_factor_assigned" };

      const canonical = await resolveCanonicalActiveFactor(client as never, oci, asOf);
      if (!canonical.ok || !canonical.vendorId) {
        return { submitted: false, reason: `no_canonical_factor:${canonical.reason ?? "unknown"}` };
      }

      const reservePct = Number(factor.reserve_rate) * 100;
      const feePct = Number(factor.fee_rate) * 100;
      const { reserveAmount, feeAmount, advanceAmount, advanceRatePct } = computeFactoringSubmitAmounts(
        pledgeCents,
        reservePct,
        feePct
      );

      const displayId = await nextFactoringDisplayId(client, oci, new Date());
      const insertRes = await client.query(
        `
          INSERT INTO accounting.factoring_advances (
            operating_company_id,
            factoring_company_vendor_id,
            display_id,
            status,
            submission_batch_ref,
            invoice_total_cents,
            advance_rate_pct,
            advance_amount_cents,
            reserve_pct,
            reserve_amount_cents,
            factor_fee_pct,
            factor_fee_cents,
            notes,
            memo,
            created_by_user_id
          )
          VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13)
          RETURNING id
        `,
        [
          oci,
          canonical.vendorId,
          displayId,
          `auto:delivered:${input.loadId}`,
          pledgeCents,
          advanceRatePct,
          advanceAmount,
          reservePct,
          reserveAmount,
          feePct,
          feeAmount,
          "Auto-submitted on delivery (FACT-DELIVERED-AUTO). Funding JE posts at actual Faro funding.",
          input.actorUserId,
        ]
      );
      const advanceId = String((insertRes.rows[0] as { id?: string } | undefined)?.id ?? "");
      if (!advanceId) return { submitted: false, reason: "insert_failed" };

      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_advance_id = $2,
              factoring_status = 'submitted',
              updated_at = now(),
              updated_by_user_id = $3
          WHERE operating_company_id = $1::uuid
            AND id = $4
        `,
        [oci, advanceId, input.actorUserId, inv.id]
      );

      await appendCrudAudit(
        client,
        input.actorUserId,
        "accounting.factoring_submitted",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: advanceId,
          operating_company_id: oci,
          display_id: displayId,
          invoice_count: 1,
          auto_source: "delivery",
          load_id: input.loadId,
        },
        "info",
        "FACT-DELIVERED-AUTO"
      );

      return { submitted: true, advanceId, displayId };
    });
  } catch (err) {
    console.warn({ err, load_id: input.loadId }, "fact_delivered_auto_submit_failed");
    return { submitted: false, reason: "error" };
  }
}

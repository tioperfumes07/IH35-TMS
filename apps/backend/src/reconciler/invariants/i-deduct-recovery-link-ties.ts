import type { Invariant, Queryable, ReconcilerException } from "../types.js";

const INVARIANT_ID = "I-DEDUCT";
const OWNER_SEAT = "CC-1";

/**
 * A customer short-pay recovered from a driver is recorded in driver_finance.deduction_recovery_links
 * (migration 202614290000). trg_recovery_not_over_disputed checks the link only when it is written:
 * fault_party = 'driver' and the live links on the dispute sum to no more than disputed_amount_cents.
 * Nothing re-checks it when the other side changes afterwards, so this invariant does, for every live
 * link, and in the reverse direction for every driver-fault dispute.
 */
type LinkField =
  | "invoice_line_gone"
  | "invoice_voided"
  | "fault_not_driver"
  | "over_recovered"
  | "deduction_voided"
  | "deduction_short";

type DisputeField = "driver_fault_unrecovered";

export type IDeductField = LinkField | DisputeField;

type LinkRow = {
  link_id: string;
  dispute_id: string;
  invoice_label: string | null;
  created_at: string;
  recovered_cents: string;
  line_gone: boolean;
  invoice_voided: boolean;
  fault_party: string;
  disputed_cents: string;
  dispute_recovered_cents: string;
  deduction_voided: boolean;
  deduction_cents: string;
};

type DisputeRow = {
  dispute_id: string;
  invoice_label: string | null;
  fault_decided_at: string | null;
  created_at: string;
  disputed_cents: string;
};

export const I_DEDUCT_LINKS_SQL = `
  SELECT l.id::text AS link_id,
         l.invoice_dispute_id::text AS dispute_id,
         i.display_id AS invoice_label,
         l.created_at::text AS created_at,
         l.recovered_amount_cents::text AS recovered_cents,
         (l.invoice_line_id IS NOT NULL AND il.soft_deleted_at IS NOT NULL) AS line_gone,
         (i.voided_at IS NOT NULL) AS invoice_voided,
         d.fault_party,
         d.disputed_amount_cents::text AS disputed_cents,
         (sum(l.recovered_amount_cents) OVER (PARTITION BY l.invoice_dispute_id))::text AS dispute_recovered_cents,
         (sd.voided_at IS NOT NULL) AS deduction_voided,
         sd.amount_cents::text AS deduction_cents
    FROM driver_finance.deduction_recovery_links l
    JOIN accounting.invoice_disputes d
      ON d.id = l.invoice_dispute_id AND d.operating_company_id = l.operating_company_id
    JOIN driver_finance.driver_settlement_deductions sd
      ON sd.id = l.driver_settlement_deduction_id AND sd.operating_company_id = l.operating_company_id
    LEFT JOIN accounting.invoice_lines il
      ON il.id = l.invoice_line_id AND il.operating_company_id = l.operating_company_id
    LEFT JOIN accounting.invoices i
      ON i.id = coalesce(l.invoice_id, il.invoice_id, d.invoice_id) AND i.operating_company_id = l.operating_company_id
   WHERE l.operating_company_id = $1::uuid
     AND l.voided_at IS NULL
   ORDER BY l.created_at, l.id
`;

export const I_DEDUCT_DISPUTES_SQL = `
  SELECT d.id::text AS dispute_id,
         i.display_id AS invoice_label,
         d.fault_decided_at::text AS fault_decided_at,
         d.created_at::text AS created_at,
         d.disputed_amount_cents::text AS disputed_cents
    FROM accounting.invoice_disputes d
    LEFT JOIN accounting.invoices i
      ON i.id = d.invoice_id AND i.operating_company_id = d.operating_company_id
   WHERE d.operating_company_id = $1::uuid
     AND d.fault_party = 'driver'
     AND d.status <> 'cancelled'
     AND d.disputed_amount_cents > 0
     AND NOT EXISTS (
       SELECT 1
         FROM driver_finance.deduction_recovery_links l
        WHERE l.invoice_dispute_id = d.id
          AND l.operating_company_id = d.operating_company_id
          AND l.voided_at IS NULL
     )
   ORDER BY d.created_at, d.id
`;

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function label(invoiceLabel: string | null): string {
  return invoiceLabel ? `Invoice ${invoiceLabel}` : "An invoice";
}

export function iDeductExceptionsForLink(row: LinkRow): ReconcilerException[] {
  const recovered = Number(row.recovered_cents);
  const disputed = Number(row.disputed_cents);
  const disputeRecovered = Number(row.dispute_recovered_cents);
  const deduction = Number(row.deduction_cents);
  const who = label(row.invoice_label);
  const found: Array<[LinkField, string, number | null]> = [];
  if (row.line_gone) found.push(["invoice_line_gone", `${who}: the invoice line this driver recovery was charged against has been removed, but the driver is still charged ${dollars(recovered)}.`, recovered]);
  if (row.invoice_voided) found.push(["invoice_voided", `${who} was voided, but the driver is still charged ${dollars(recovered)} for its short-pay.`, recovered]);
  if (row.fault_party !== "driver") found.push(["fault_not_driver", `${who}: the short-pay is now decided as ${row.fault_party} fault, not the driver's, but the driver is still charged ${dollars(recovered)}.`, recovered]);
  if (disputeRecovered > disputed) found.push(["over_recovered", `${who}: drivers are charged ${dollars(disputeRecovered)} for a short-pay of ${dollars(disputed)}.`, disputeRecovered - disputed]);
  if (row.deduction_voided) found.push(["deduction_voided", `${who}: the driver deduction that recovers ${dollars(recovered)} was voided, but the recovery link still counts it.`, recovered]);
  if (!row.deduction_voided && recovered > deduction) found.push(["deduction_short", `${who}: the recovery claims ${dollars(recovered)} but the driver deduction behind it is ${dollars(deduction)}.`, recovered - deduction]);
  return found.map(([field, reason, amount]) => ({
    key: `${INVARIANT_ID}/recovery_link/${row.link_id}/${field}`,
    invariant: INVARIANT_ID,
    entity_type: "recovery_link",
    entity_id: row.link_id,
    entity_label: row.invoice_label ?? row.dispute_id,
    field,
    reason,
    since: row.created_at,
    since_source: "driver_finance.deduction_recovery_links.created_at",
    owner_seat: OWNER_SEAT,
    repair_engine: null,
    amount_cents: amount,
    amount_source: field === "over_recovered" ? "accounting.invoice_disputes.disputed_amount_cents" : "driver_finance.deduction_recovery_links.recovered_amount_cents",
  }));
}

export function iDeductExceptionForDispute(row: DisputeRow): ReconcilerException {
  const disputed = Number(row.disputed_cents);
  return {
    key: `${INVARIANT_ID}/invoice_dispute/${row.dispute_id}/driver_fault_unrecovered`,
    invariant: INVARIANT_ID,
    entity_type: "invoice_dispute",
    entity_id: row.dispute_id,
    entity_label: row.invoice_label ?? row.dispute_id,
    field: "driver_fault_unrecovered",
    reason: `${label(row.invoice_label)}: a ${dollars(disputed)} short-pay was decided as the driver's fault, and no driver deduction recovers it.`,
    since: row.fault_decided_at ?? row.created_at,
    since_source: row.fault_decided_at ? "accounting.invoice_disputes.fault_decided_at" : "accounting.invoice_disputes.created_at",
    owner_seat: OWNER_SEAT,
    repair_engine: null,
    amount_cents: disputed,
    amount_source: "accounting.invoice_disputes.disputed_amount_cents",
  };
}

export const iDeductRecoveryLinkTies: Invariant = {
  id: INVARIANT_ID,
  title: "A driver recovery still ties to the customer short-pay it recovers",
  ownerSeat: OWNER_SEAT,
  repairEngine: null,
  async detect(client: Queryable, operatingCompanyId: string) {
    const links = await client.query<LinkRow>(I_DEDUCT_LINKS_SQL, [operatingCompanyId]);
    const disputes = await client.query<DisputeRow>(I_DEDUCT_DISPUTES_SQL, [operatingCompanyId]);
    return [...links.rows.flatMap(iDeductExceptionsForLink), ...disputes.rows.map(iDeductExceptionForDispute)];
  },
};

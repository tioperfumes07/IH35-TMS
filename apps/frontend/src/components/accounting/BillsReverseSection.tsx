import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { billVendorDrillId, listBills } from "../../api/accounting";
import { formatDateUS } from "../../lib/formatDate";
import { formatMoneyCents } from "../dispatch/constants";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { entityLabel } from "../../lib/entity-label";
import { CappedListNotice } from "../CappedListNotice";

const BILLS_REVERSE_LIST_LIMIT = 200;

/**
 * FINAL-WEEKEND-FULL-WIRING-2026-08-12 rank 6 — Built reverse_link for bills.
 * ACCT-F5035: insurance_claim_id on ClaimsTab.
 * ACCT-F5036: unit_id on VehicleProfilePage (create already stamps unit_id).
 * ACCT-F5037: load_id via bill_lines on LoadDetailDrawer.
 */

type Filter =
  | { insurance_claim_id: string; unit_id?: never; load_id?: never }
  | { unit_id: string; insurance_claim_id?: never; load_id?: never }
  | { load_id: string; insurance_claim_id?: never; unit_id?: never };

type Props = {
  operatingCompanyId: string;
  filter: Filter;
  contextLabel: string;
  "data-testid"?: string;
};

export function BillsReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "bills-reverse",
}: Props) {
  const filterKey = Object.keys(filter)[0] as keyof Filter;
  const filterValue = Object.values(filter)[0] as string;
  const billsQ = useQuery({
    queryKey: ["accounting", "bills", "reverse", operatingCompanyId, filter],
    queryFn: () => listBills(operatingCompanyId, { ...filter, limit: BILLS_REVERSE_LIST_LIMIT }),
    enabled: Boolean(operatingCompanyId) && Boolean(filterValue),
  });
  const rows = billsQ.data?.rows ?? [];

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Bills
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <Link
          className="text-xs font-semibold text-slate-700 underline"
          to={`/accounting/bills?${filterKey}=${encodeURIComponent(filterValue)}`}
        >
          Open Bills
        </Link>
      </div>
      {billsQ.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {billsQ.isError ? <p className="text-sm text-red-600">Could not load bills for {contextLabel}.</p> : null}
      {!billsQ.isLoading && !billsQ.isError && rows.length === 0 ? (
        <p className="text-sm text-gray-500">No bills linked to {contextLabel}.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-sm text-slate-700" data-testid={`bill-reverse-${row.id}`}>
              <EntityLink kind="bill" id={row.id} label={entityLabel(row.bill_number, row.id, "Bill")} className="font-medium" />
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.bill_date)} · {formatMoneyCents(Number(row.amount_cents), "USD")} · {row.status}
                {row.vendor_name || billVendorDrillId(row) ? (
                  <> · <EntityLinkOrTombstone kind="vendor" id={billVendorDrillId(row)} name={row.vendor_name} noun="Vendor" /></>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <CappedListNotice
        shown={rows.length}
        limit={BILLS_REVERSE_LIST_LIMIT}
        total={billsQ.data?.total}
        hint={`Open the full Bills list filtered by ${contextLabel} to see the rest.`}
      />
    </div>
  );
}

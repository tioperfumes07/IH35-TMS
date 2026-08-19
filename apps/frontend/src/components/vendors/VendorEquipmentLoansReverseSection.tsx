import { useQuery } from "@tanstack/react-query";
import { listEquipmentLoans } from "../../api/data-infra";
import { formatUsdCents } from "../../lib/money";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";

// LINK-F5171/LINK-F5182 — factoring:home.equipment_loans reverse gap, vendor side. The unit side
// already reverse-links via UnitFinanceLinkageTab.tsx; l.lender_vendor_id is the same real FK on
// banking.equipment_loans, now exposed as an optional vendor_id filter (LINK-F5182), applied
// server-side (not a client-side slice of the LIMIT 300 company-wide list).
export function VendorEquipmentLoansReverseSection({ operatingCompanyId, vendorId }: { operatingCompanyId: string; vendorId: string }) {
  const query = useQuery({
    queryKey: ["vendor-equipment-loans-reverse", operatingCompanyId, vendorId],
    queryFn: () => listEquipmentLoans(operatingCompanyId, vendorId).then((r) => r.rows),
    enabled: Boolean(operatingCompanyId && vendorId),
  });
  const loans = query.data ?? [];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="vendor-equipment-loans-reverse">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Equipment loans (CCG)</h2>
        <EntityLink
          kind="equipment_loans_vendor"
          id={vendorId}
          label="Open Equipment Loans"
          className="text-xs font-semibold text-slate-700 underline"
        />
      </div>
      {query.isError ? <p className="mt-2 text-xs text-red-700">Equipment loans unavailable.</p> : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && loans.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No equipment loans from this vendor.</p>
      ) : null}
      {loans.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {loans.slice(0, 5).map((loan) => (
            <li key={loan.id}>
              <EntityLink
                kind="equipment_loans_vendor"
                id={vendorId}
                label={`${entityLabel(loan.equipment_number, loan.equipment_id, "Equipment")} · ${formatUsdCents(loan.outstanding_balance_cents ?? loan.principal_cents)} · ${loan.status}`}
                className="text-xs font-semibold text-slate-700 hover:underline"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

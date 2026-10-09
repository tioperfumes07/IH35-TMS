import { useQuery } from "@tanstack/react-query";
import { leasesApi } from "../../api/leases";
import { EntityLink } from "../shared/EntityLink";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCentsTable } from "../../lib/money";

/** ROUND 316 — the lease side of a unit / trailer profile: its contracts (amount, term, lessor) and lease bills + payments. */
export function AssetLeaseSection({ operatingCompanyId, unitId, equipmentId }: { operatingCompanyId: string; unitId?: string; equipmentId?: string }) {
  const q = useQuery({
    queryKey: ["leases", "by-asset", operatingCompanyId, unitId ?? null, equipmentId ?? null],
    queryFn: () => leasesApi.byAsset(operatingCompanyId, unitId ? { unit_id: unitId } : { equipment_id: equipmentId }),
    enabled: Boolean(operatingCompanyId && (unitId || equipmentId)),
  });
  const contracts = q.data?.contracts ?? [];
  const bills = q.data?.bills ?? [];
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3 text-xs" data-testid="asset-lease-section">
      <div className="font-semibold text-[#0F1219]">Lease</div>
      {q.isError ? <p className="text-gray-600">Could not load the lease for this {unitId ? "unit" : "trailer"}.</p> : null}
      {!q.isLoading && !contracts.length ? <p className="text-gray-500">No lease contract covers this {unitId ? "unit" : "trailer"} yet.</p> : null}
      {contracts.map((c) => (
        <div key={c.asset_line_id} className="flex flex-wrap items-center gap-3">
          <EntityLink kind="lease_contract" id={c.id} label={c.display_id ?? "Lease"} className="font-semibold underline" />
          <span>{c.status}</span>
          <span>{formatUsdCentsTable(c.monthly_amount_cents ?? 0)} / month</span>
          <span>{formatDateUS(c.commencement_date)} – {formatDateUS(c.end_date)}</span>
          {c.lessor_vendor_id ? <EntityLink kind="vendor" id={c.lessor_vendor_id} label={c.lessor_vendor ?? c.lessor_company ?? "Lessor"} className="underline" /> : <span>{c.lessor_company}</span>}
        </div>
      ))}
      {bills.length ? (
        <ul className="divide-y divide-gray-100">
          {bills.slice(0, 24).map((b) => (
            <li key={b.bill_id} className="flex flex-wrap items-center gap-3 py-1">
              <EntityLink kind="bill" id={b.bill_id} label={b.display_id ?? "Bill"} className="underline" />
              <span>{b.lease_period_start ? `${b.lease_period_start.slice(5, 7)}/${b.lease_period_start.slice(0, 4)}` : formatDateUS(b.bill_date)}</span>
              <span>{formatUsdCentsTable(Math.round(Number(b.line_amount) * 100))}</span>
              <span>{b.status}</span>
              {b.last_payment_id ? <EntityLink kind="bill_payment" id={b.last_payment_id} label="Payment" className="underline" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

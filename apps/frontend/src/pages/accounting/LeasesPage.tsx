import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { leasesApi, type LeaseListRow } from "../../api/leases";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { Button } from "../../components/Button";
import { LeaseContractCreator } from "../../components/leases/LeaseContractCreator";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCentsTable } from "../../lib/money";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

/** ROUND 316 — every lease contract of this entity; + Create opens the Owner-only creator. */
export function LeasesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ["leases", "list", companyId], queryFn: () => leasesApi.list(companyId), enabled: Boolean(companyId) });
  const columns = useMemo<ParityColumn<LeaseListRow>[]>(
    () => [
      { key: "display_id", label: "Lease", alwaysVisible: true, render: (r) => <EntityLink kind="lease_contract" id={r.id} label={r.display_id ?? `Lease ${r.id.slice(0, 8)}`} className="font-semibold underline" /> },
      { key: "lease_type", label: "Type", render: (r) => r.lease_type ?? "—" },
      { key: "status", label: "Status", render: (r) => r.status },
      { key: "lessor_vendor", label: "Lessor", render: (r) => (r.lessor_vendor_id ? <EntityLink kind="vendor" id={r.lessor_vendor_id} label={r.lessor_vendor ?? r.lessor_company ?? "Vendor"} className="underline" /> : r.lessor_company ?? "—") },
      { key: "billing_mode", label: "Billing", render: (r) => (r.billing_mode === "one_bill_per_unit" ? "Per unit" : r.billing_mode === "one_bill_all_units" ? "All units" : "—") },
      { key: "asset_count", label: "Units / trailers", sortValue: (r) => r.asset_count, render: (r) => String(r.asset_count) },
      { key: "payment_amount_cents", label: "Monthly", sortValue: (r) => r.payment_amount_cents, render: (r) => formatUsdCentsTable(r.payment_amount_cents) },
      { key: "commencement_date", label: "From", sortValue: (r) => r.commencement_date, render: (r) => formatDateUS(r.commencement_date) },
      { key: "end_date", label: "To", render: (r) => formatDateUS(r.end_date) },
      { key: "bill_count", label: "Bills", render: (r) => String(r.bill_count) },
    ],
    []
  );
  return (
    <AccountingSubNavWrapper title="Leases" subtitle="Truck, trailer and lease-to-own contracts — one row per contract">
      <div className="mb-2 flex justify-end"><Button onClick={() => setCreating(true)}>+ Create lease</Button></div>
      {query.isError ? (
        <ListErrorState {...formatQueryErrorDetail(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <ParityTable rows={query.data?.leases ?? []} columns={columns} rowKey={(r) => r.id} loading={query.isLoading} storageKey="leases-list" exportFilename="leases" tableTestId="leases-table" emptyText="No lease contracts yet." />
      )}
      <LeaseContractCreator open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/accounting/leases/${id}`)} />
    </AccountingSubNavWrapper>
  );
}

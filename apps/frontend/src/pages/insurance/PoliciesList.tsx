import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  listInsurancePolicies,
  listInsuranceTypeCatalog,
  type InsurancePolicy,
  type InsurancePolicyStatus,
} from "../../api/insurance";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { PolicyCreateModal } from "../../components/insurance/PolicyCreateModal";
import { useCompanyContext } from "../../contexts/CompanyContext";

function formatMoney(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysUntil(value: string) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const target = new Date(`${value}T00:00:00.000Z`);
  return Math.floor((target.getTime() - start.getTime()) / 86400000);
}

function statusBadge(status: InsurancePolicyStatus) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "pending") return "bg-amber-50 text-amber-800";
  if (status === "expired") return "bg-slate-100 text-slate-700";
  return "bg-red-50 text-red-700";
}

export function PoliciesList() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = selectedCompanyId ?? "";
  const [createOpen, setCreateOpen] = useState(false);

  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"" | InsurancePolicyStatus>("");
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false);
  const canCreatePolicy = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Accountant";

  const policiesQuery = useQuery({
    queryKey: ["insurance", "policies", companyId, typeFilter || "all", statusFilter || "all"],
    enabled: Boolean(companyId),
    queryFn: () =>
      listInsurancePolicies({
        operating_company_id: companyId,
        coverage_type: typeFilter ? (typeFilter as InsurancePolicy["coverage_type"]) : undefined,
        status: statusFilter || undefined,
      }).then((result) => result.policies),
  });

  const typesQuery = useQuery({
    queryKey: ["insurance", "type-catalog", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsuranceTypeCatalog({ operating_company_id: companyId }).then((result) => result.types),
  });

  const rows = useMemo(() => {
    const policies = policiesQuery.data ?? [];
    if (!expiringSoonOnly) return policies;
    return policies.filter((policy) => {
      const remaining = daysUntil(policy.expiry_date);
      return remaining >= 0 && remaining <= 30;
    });
  }, [expiringSoonOnly, policiesQuery.data]);

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to view policies.</div>;
  }

  return (
    <div className="space-y-4">
      <header className="rounded border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Policies</h2>
            <p className="mt-1 text-xs text-slate-600">Filter and review insurance policies. Click any row to open policy details.</p>
          </div>
          {canCreatePolicy ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              + Policy
            </Button>
          ) : null}
        </div>
      </header>

      <section className="rounded border border-gray-200 bg-white p-3">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            Type
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">All types</option>
              {(typesQuery.data ?? []).map((type) => (
                <option key={type.id} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-600">
            Status
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              value={statusFilter}
              onChange={(event) => setStatusFilter((event.target.value || "") as "" | InsurancePolicyStatus)}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <label className="col-span-2 flex items-center gap-2 pt-5 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={expiringSoonOnly}
              onChange={(event) => setExpiringSoonOnly(event.target.checked)}
              className="h-4 w-4 rounded border border-gray-300"
            />
            Expiring soon (next 30 days)
          </label>
        </div>
      </section>

      {policiesQuery.isLoading ? <div className="text-sm text-slate-500">Loading policies...</div> : null}
      {policiesQuery.isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">Failed to load insurance policies.</div>
      ) : null}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Policy #</th>
              <th className="px-3 py-2 font-semibold">Insurer</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Coverage Amount</th>
              <th className="px-3 py-2 font-semibold">Effective Date</th>
              <th className="px-3 py-2 font-semibold">Expiry Date</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((policy) => (
              <tr
                key={policy.id}
                className="cursor-pointer border-t border-gray-100 hover:bg-blue-50"
                onClick={() => navigate(`/safety/insurance/policies/${policy.id}`)}
              >
                <td className="px-3 py-2 font-medium text-slate-800">{policy.policy_number}</td>
                <td className="px-3 py-2 text-slate-700">{policy.insurer_name}</td>
                <td className="px-3 py-2 text-slate-700">{policy.coverage_type}</td>
                <td className="px-3 py-2 text-slate-700">{formatMoney(policy.total_premium_cents)}</td>
                <td className="px-3 py-2 text-slate-700">{policy.effective_date}</td>
                <td className="px-3 py-2 text-slate-700">{policy.expiry_date}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${statusBadge(policy.status)}`}>{policy.status}</span>
                </td>
              </tr>
            ))}
            {!policiesQuery.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-5 text-center text-sm text-slate-500">
                  No policies found for the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <PolicyCreateModal
        open={createOpen}
        operatingCompanyId={companyId}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await queryClient.invalidateQueries({ queryKey: ["insurance", "policies", companyId] });
        }}
      />
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  listInsurancePolicies,
  listInsuranceTypeCatalog,
  type InsurancePolicy,
  type InsurancePolicyStatus,
} from "../../api/insurance";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { useListState } from "../../components/list-state";
import { PolicyCreateModal } from "../../components/insurance/PolicyCreateModal";
import { PolicyCreateWizard } from "../../components/insurance/PolicyCreateWizard";
import { TaskLinkPicker } from "../../components/tasks/TaskLinkPicker";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { formatDateUS } from "../../lib/formatDate";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { insuranceTypeLabel } from "../../lib/insurance-type-label";
import { companyToday } from "../../lib/businessDate";
import { statusOptions } from "../../lib/statusListParams";

const STATUS_FILTER_OPTIONS = statusOptions({
  active: "Active",
  pending: "Pending",
  expired: "Expired",
  cancelled: "Cancelled",
});

function formatMoney(cents: number) {
  return formatUsdCents(cents);
}

function daysUntil(value: string) {
  const start = new Date(`${companyToday()}T00:00:00.000Z`);
  const target = new Date(`${value}T00:00:00.000Z`);
  return Math.floor((target.getTime() - start.getTime()) / 86400000);
}

function statusBadge(status: InsurancePolicyStatus) {
  if (status === "active") return "bg-[#F7F8FA] text-[#1F2A44]";
  if (status === "pending") return "bg-[#F7F8FA] text-[#1F2A44]";
  if (status === "expired") return "bg-[#F7F8FA] text-[#1F2A44]";
  return "bg-red-50 text-red-700";
}

export function PoliciesList() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const vendorId = useSearchParams()[0].get("vendor_id") ?? undefined;
  const companyId = selectedCompanyId ?? "";
  const [createOpen, setCreateOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  // TASKS-PLANNER-V2 — the just-created policy, offered a "Tasks" completion button (role='result').
  const [lastPolicyId, setLastPolicyId] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false);
  const staged = useStagedListFilters({
    applied: { typeFilter, statusFilter, expiringSoonOnly },
    empty: { typeFilter: "", statusFilter: [] as string[], expiringSoonOnly: false },
    onApply: (next) => { setTypeFilter(next.typeFilter); setStatusFilter(next.statusFilter); setExpiringSoonOnly(next.expiringSoonOnly); },
  });
  const canCreatePolicy = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Accountant";

  const policiesQuery = useQuery({
    queryKey: ["insurance", "policies", companyId, typeFilter || "all", statusFilter.join(",") || "all", vendorId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      // U12: multi-select — API takes one status; 0/1 pass through; 2+ fetch unscoped then filter.
      const status = statusFilter.length === 1 ? (statusFilter[0] as InsurancePolicyStatus) : undefined;
      const policies = await listInsurancePolicies({
        operating_company_id: companyId,
        coverage_type: typeFilter ? (typeFilter as InsurancePolicy["coverage_type"]) : undefined,
        status,
        vendor_id: vendorId,
      }).then((result) => result.policies);
      if (statusFilter.length <= 1) return policies;
      return policies.filter((policy) => statusFilter.includes(policy.status));
    },
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

  const listState = useListState(policiesQuery, rows.length === 0);

  const coverageTypeName = (policy: InsurancePolicy) =>
    insuranceTypeLabel(
      policy.coverage_type,
      policy.coverage_type_name ?? (typesQuery.isError ? undefined : typesQuery.data?.find((entry) => entry.code === policy.coverage_type)?.name),
    );

  // TBL-STANDARD: shared ParityTable columns (alignment per GLOBAL-SORT-RULE — text centers, money/dates right).
  const columns: ParityColumn<InsurancePolicy>[] = [
    { key: "policy_number", label: "Policy #", sortable: true, render: (p: InsurancePolicy) => <EntityLink kind="insurance_policy" id={p.id} label={entityLabel(p.policy_number, p.id, "Policy")} className="font-medium text-[#0F1219]" /> },
    { key: "insurer_name", label: "Insurer", sortable: true },
    { key: "coverage_type", label: "Type", sortable: true, render: (p: InsurancePolicy) => coverageTypeName(p) },
    { key: "total_premium_cents", label: "Coverage Amount", sortable: true, cellClass: "text-right tabular-nums", render: (p: InsurancePolicy) => formatMoney(p.total_premium_cents) },
    { key: "effective_date", label: "Effective Date", sortable: true, cellClass: "text-right", render: (p: InsurancePolicy) => formatDateUS(p.effective_date) },
    { key: "expiry_date", label: "Expiry Date", sortable: true, cellClass: "text-right", render: (p: InsurancePolicy) => formatDateUS(p.expiry_date) },
    { key: "status", label: "Status", sortable: true, render: (p: InsurancePolicy) => (
      <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${statusBadge(p.status)}`}>{p.status}</span>
    ) },
  ];

  if (!companyId) {
    return <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">Select an operating company to view policies.</div>;
  }

  return (
    <div className="space-y-4">
      <header className="rounded-sm border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold text-[#0F1219]">Policies</h2>
            <p className="mt-1 text-xs text-[#4B5563]">Filter and review insurance policies. Click any row to open policy details.</p>
          </div>
          {canCreatePolicy ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => setWizardOpen(true)}>
                + Create policy
              </Button>
              <Button
                type="button"
                variant="secondary"
                data-testid="policy-create-modal-open"
                onClick={() => setCreateOpen(true)}
              >
                + Create policy form
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      {lastPolicyId ? (
        <div className="flex items-center justify-between gap-3 rounded-sm border border-gray-200 bg-white px-3 py-2">
          <span className="text-xs text-gray-600">Close an open task this policy fulfils:</span>
          <TaskLinkPicker
            operatingCompanyId={companyId}
            targetType="policy"
            targetId={lastPolicyId}
            onLinked={() => setLastPolicyId(null)}
          />
        </div>
      ) : null}

      <CollapsedListFilters
        activeFilterCount={(typeFilter ? 1 : 0) + (statusFilter.length ? 1 : 0) + (expiringSoonOnly ? 1 : 0)}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="insurance-policies"
        dataAttributes={{ "data-insurance-policies-filter-toolbar": "collapsed" }}
        className="rounded-sm border border-gray-200 bg-white p-2"
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="text-xs font-semibold text-[#4B5563]">
            <label htmlFor="insurance-policies-type-filter">Type</label>
            {typesQuery.isError ? (
              <ListErrorState
                title="Couldn't load coverage types"
                status={0}
                message="The policy type filter is unavailable."
                onRetry={() => void typesQuery.refetch()}
              />
            ) : (
              <Combobox
                id="insurance-policies-type-filter"
                className="mt-1 w-full"
                value={staged.draft.typeFilter}
                onChange={(next) => staged.setDraft({ ...staged.draft, typeFilter: next ?? "" })}
                options={[
                  { value: "", label: "All types" },
                  ...(typesQuery.data ?? []).map((type) => ({ value: type.code, label: type.name })),
                ]}
                allowClear={false}
              />
            )}
          </div>

          <div className="text-xs font-semibold text-[#4B5563]" data-testid="insurance-policies-status-filter">
            <label htmlFor="insurance-policies-status-filter">Status</label>
            <div className="mt-1" id="insurance-policies-status-filter">
              <MultiSelectDropdown
                label="Status"
                options={STATUS_FILTER_OPTIONS}
                selected={staged.draft.statusFilter}
                onChange={(next) => staged.setDraft({ ...staged.draft, statusFilter: next })}
                allLabel="All statuses"
                data-testid="insurance-policies-status-multiselect"
              />
            </div>
          </div>

          <label className="col-span-2 flex items-center gap-2 pt-5 text-xs font-semibold text-[#1F2A44]">
            <input
              type="checkbox"
              checked={staged.draft.expiringSoonOnly}
              onChange={(event) => staged.setDraft({ ...staged.draft, expiringSoonOnly: event.target.checked })}
              className="h-4 w-4 rounded-sm border border-gray-300"
            />
            Expiring soon (next 30 days)
          </label>
        </div>
      </CollapsedListFilters>

      {/* TBL-STANDARD: shared ParityTable (universal alignment + page-size + sort). Filters (Type/Status/
          Expiring-soon) above feed `rows`; row-click → policy details preserved exactly. */}
      {policiesQuery.isError ? (
        <ListErrorState
          title="Couldn't load list"
          status={0}
          message="Failed to load insurance policies."
          onRetry={() => { void policiesQuery.refetch(); }}
        />
      ) : (
        <ParityTable
          title="Insurance policies"
          storageKey="insurance-policies"
          columns={columns}
          rows={rows}
          rowKey={(policy) => policy.id}
          onRowClick={(policy) => navigate(`/insurance/policies/${policy.id}`)}
          loading={listState.isLoading}
          emptyText="No insurance policies found for this entity yet."
        />
      )}

      <PolicyCreateModal
        open={createOpen}
        operatingCompanyId={companyId}
        onClose={() => setCreateOpen(false)}
        onCreated={async (policyId) => {
          setCreateOpen(false);
          if (policyId) setLastPolicyId(policyId);
          await queryClient.invalidateQueries({ queryKey: ["insurance", "policies", companyId] });
        }}
      />
      <PolicyCreateWizard
        open={wizardOpen}
        operatingCompanyId={companyId}
        onClose={() => setWizardOpen(false)}
        onCreated={async (policyId) => {
          setWizardOpen(false);
          if (policyId) setLastPolicyId(policyId);
          await queryClient.invalidateQueries({ queryKey: ["insurance", "policies", companyId] });
        }}
      />
    </div>
  );
}

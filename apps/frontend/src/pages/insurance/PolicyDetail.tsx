import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  archiveInsurancePolicy,
  getInsurancePolicy,
  listInsuranceTypeCatalog,
  listInsuranceClaims,
  listInsuranceCoiRequests,
  listInsuranceLawsuits,
  updateInsurancePolicy,
  type InsuranceClaim,
  type InsuranceCoiRequest,
  type InsuranceLawsuit,
  type InsurancePolicyStatus,
  type InsurancePolicyUnit,
} from "../../api/insurance";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatUsdCents } from "../../lib/money";
import { PaymentScheduleTab } from "./PaymentScheduleTab";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";
import { ApiError } from "../../api/client";
import { insuranceTypeLabel } from "../../lib/insurance-type-label";
import { ConfirmModal } from "../../components/shared/ConfirmModal";

function formatMoney(cents: number) {
  return formatUsdCents(cents);
}

export function PolicyDetail() {
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { policyId } = useParams<{ policyId: string }>();
  const companyId = selectedCompanyId ?? "";

  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<InsurancePolicyStatus>("active");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const policyActionGenerationRef = useRef(0);
  const [pendingArchive, setPendingArchive] = useState<{
    policyId: string;
    companyId: string;
    generation: number;
  } | null>(null);

  const policyQuery = useQuery({
    queryKey: ["insurance", "policy", policyId, companyId],
    enabled: Boolean(companyId && policyId),
    queryFn: () => getInsurancePolicy(policyId!, companyId),
  });

  const typesQuery = useQuery({
    queryKey: ["insurance", "type-catalog", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsuranceTypeCatalog({ operating_company_id: companyId }).then((result) => result.types),
  });

  const claimsQuery = useQuery({
    queryKey: ["insurance", "policy", "claims", companyId, policyId],
    enabled: Boolean(companyId && policyId),
    queryFn: () => listInsuranceClaims({ operating_company_id: companyId, policy_id: policyId }).then((result) => result.claims),
  });

  const coiQuery = useQuery({
    queryKey: ["insurance", "policy", "coi", companyId, policyId],
    enabled: Boolean(companyId && policyId),
    queryFn: () =>
      listInsuranceCoiRequests({ operating_company_id: companyId, policy_id: policyId }).then(
        (result) => result.requests,
      ),
  });

  const lawsuitsQuery = useQuery({
    queryKey: ["insurance", "policy", "lawsuits", companyId, policyId],
    enabled: Boolean(companyId && policyId),
    queryFn: () =>
      listInsuranceLawsuits({ operating_company_id: companyId, policy_id: policyId }).then(
        (result) => result.lawsuits,
      ),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      policyId: string;
      companyId: string;
      generation: number;
      payload: { status: InsurancePolicyStatus; effective_date: string; expiry_date: string };
    }) => updateInsurancePolicy(input.policyId, input.companyId, input.payload),
    onSuccess: async (_result, input) => {
      if (input.generation !== policyActionGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["insurance", "policy", input.policyId, input.companyId] });
      await queryClient.invalidateQueries({ queryKey: ["insurance", "policies", input.companyId] });
      pushToast("Policy updated", "success");
      setEditing(false);
    },
    onError: (_error, input) => {
      if (input.generation === policyActionGenerationRef.current) pushToast("Failed to update policy", "error");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (input: { policyId: string; companyId: string; generation: number }) =>
      archiveInsurancePolicy(input.policyId, input.companyId),
    onSuccess: async (_result, input) => {
      if (input.generation !== policyActionGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["insurance", "policies", input.companyId] });
      pushToast("Policy archived", "success");
      navigate("/safety/insurance/policies");
    },
    onError: (_error, input) => {
      if (input.generation === policyActionGenerationRef.current) pushToast("Failed to archive policy", "error");
    },
  });

  useEffect(() => {
    policyActionGenerationRef.current += 1;
    setPendingArchive(null);
    setEditing(false);
    updateMutation.reset();
    archiveMutation.reset();
  }, [companyId, policyId]);

  const claims = claimsQuery.data ?? [];
  const coiRows = coiQuery.data ?? [];
  const lawsuitRows = lawsuitsQuery.data ?? [];

  const unitColumns = useMemo<ParityColumn<InsurancePolicyUnit>[]>(
    () => [
      {
        key: "unit_id",
        label: "Unit",
        render: (unit) => {
          const unitId = unit.unit_id ?? unit.asset_id;
          return (
            <EntityLink
              kind="unit"
              id={unitId}
              label={entityLabel(unit.unit_number, unitId, "Unit")}
            />
          );
        },
      },
      { key: "insured_value_cents", label: "Insured Value", sortable: true, render: (unit) => formatMoney(unit.insured_value_cents) },
      { key: "created_at", label: "Assigned", sortable: true, render: (unit) => formatDateUS(unit.created_at) },
    ],
    [],
  );

  const coiColumns = useMemo<ParityColumn<InsuranceCoiRequest>[]>(
    () => [
      {
        key: "customer_id",
        label: "Customer",
        render: (row) => (
          <EntityLink
            kind="customer"
            id={row.customer_id}
            label={entityLabel(row.customer_name, row.customer_id, "Customer")}
          />
        ),
      },
      { key: "requested_at", label: "Requested", sortable: true, render: (row) => formatDateUS(row.requested_at) },
      { key: "status", label: "Status", sortable: true },
      { key: "document_url", label: "Document", render: (row) => (row.document_url ? <a href={row.document_url} className="text-slate-700 underline">View</a> : "-") },
    ],
    [],
  );

  // C-16: this table listed claims for the policy but the claim number was plain text — the
  // office could see a claim was attached but had no way to open it. EntityLink kind="claim"
  // already resolves to /safety/insurance/claims?claim_id= (ClaimsTab selects+highlights the row),
  // the same reverse chrome pattern used everywhere else claims are listed on another entity.
  const claimColumns = useMemo<ParityColumn<InsuranceClaim>[]>(
    () => [
      {
        key: "claim_number",
        label: "Claim #",
        sortable: true,
        render: (claim) => (
          <EntityLink kind="claim" id={claim.id} label={entityLabel(claim.claim_number, claim.id, "Claim")} />
        ),
      },
      { key: "status", label: "Status", sortable: true },
      { key: "amount_claimed_cents", label: "Claimed", sortable: true, render: (claim) => formatMoney(claim.amount_claimed_cents) },
    ],
    [],
  );

  const lawsuitColumns = useMemo<ParityColumn<InsuranceLawsuit>[]>(
    () => [
      {
        key: "case_number",
        label: "Case #",
        sortable: true,
        render: (row) => (
          <EntityLink kind="lawsuit" id={row.id} label={entityLabel(row.case_number, row.id, "Case")} />
        ),
      },
      { key: "status", label: "Status", sortable: true },
      { key: "demand_cents", label: "Demand", sortable: true, render: (row) => formatMoney(row.demand_cents) },
    ],
    [],
  );

  if (!companyId) {
    return <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to view policy details.</div>;
  }

  if (!policyId) {
    return <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">Missing policy ID.</div>;
  }

  if (policyQuery.isLoading) {
    return <div className="text-sm text-slate-500">Loading policy details...</div>;
  }

  if (policyQuery.isError || !policyQuery.data) {
    return (
      <ListErrorState
        title="Couldn't load policy details"
        status={policyQuery.error instanceof ApiError ? policyQuery.error.status : 0}
        message={(policyQuery.error as Error | null)?.message}
        onRetry={() => void policyQuery.refetch()}
      />
    );
  }

  const policy = policyQuery.data;
  const coverageTypeName =
    insuranceTypeLabel(
      policy.coverage_type,
      policy.coverage_type_name ?? (typesQuery.isError ? undefined : typesQuery.data?.find((entry) => entry.code === policy.coverage_type)?.name),
    );

  const openEditPanel = () => {
    if (updateMutation.isPending || archiveMutation.isPending) return;
    setStatus(policy.status);
    setEffectiveDate(policy.effective_date);
    setExpiryDate(policy.expiry_date);
    setEditing(true);
  };

  const handleArchive = () => {
    if (!policyId || archiveMutation.isPending || updateMutation.isPending) return;
    setPendingArchive({ policyId, companyId, generation: policyActionGenerationRef.current });
  };

  const closeEditPanel = () => {
    if (updateMutation.isPending) return;
    setEditing(false);
    updateMutation.reset();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        backHref="/safety/insurance/policies"
        breadcrumb={["Insurance", "Policies", entityLabel(policy.policy_number, policy.id, "Policy")]}
        title={`Policy ${entityLabel(policy.policy_number, policy.id, "Policy")}`}
        subtitle={`${policy.insurer_name} · ${coverageTypeName} · ${policy.status}`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={openEditPanel} disabled={archiveMutation.isPending || updateMutation.isPending}>
              Edit / Update
            </Button>
            <Button size="sm" variant="tertiary" loading={archiveMutation.isPending} onClick={handleArchive} disabled={updateMutation.isPending}>
              Archive
            </Button>
          </div>
        }
      />

      {editing ? (
        <div className="grid gap-2 rounded-sm border border-gray-200 bg-gray-50 p-3 md:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            Status
            <select
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={status}
              onChange={(event) => setStatus(event.target.value as InsurancePolicyStatus)}
              disabled={updateMutation.isPending}
            >
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Effective date
            <DatePicker
              className="mt-1 w-full"
              value={effectiveDate}
              onChange={(next) => setEffectiveDate(next)}
              disabled={updateMutation.isPending}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Expiry date
            <DatePicker
              className="mt-1 w-full"
              value={expiryDate}
              onChange={(next) => setExpiryDate(next)}
              disabled={updateMutation.isPending}
            />
          </label>
          <div className="flex items-end gap-2">
            <Button
              size="sm"
              loading={updateMutation.isPending}
              onClick={() =>
                updateMutation.mutate({
                  policyId,
                  companyId,
                  generation: policyActionGenerationRef.current,
                  payload: { status, effective_date: effectiveDate, expiry_date: expiryDate },
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="tertiary" onClick={closeEditPanel} disabled={updateMutation.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Units Assigned</h3>
        <div className="mt-2">
          <ParityTable
            rows={policy.units}
            columns={unitColumns}
            rowKey={(unit) => unit.id}
            loading={false}
            storageKey="insurance-policy-units"
            emptyText="No units assigned."
          />
        </div>
      </section>

      {/* Payment Schedule (INS-05) — shared PaymentScheduleTab panel (status filter + Mark paid action). */}
      <PaymentScheduleTab operatingCompanyId={companyId} policyId={policyId} />

      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">COI History (INS-04)</h3>
        <div className="mt-2">
          {coiQuery.isError ? (
            <ListErrorState
              title="Couldn't load this policy's COI history"
              status={coiQuery.error instanceof ApiError ? coiQuery.error.status : 0}
              message={(coiQuery.error as Error)?.message}
              onRetry={() => void coiQuery.refetch()}
            />
          ) : (
            <ParityTable
              rows={coiRows}
              columns={coiColumns}
              rowKey={(row) => row.id}
              loading={coiQuery.isPending || (coiQuery.isFetching && coiRows.length === 0)}
              storageKey="insurance-policy-coi"
              emptyText="No COI requests linked to this policy."
            />
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-sm border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Claims (INS-06)</h3>
          <div className="mt-2">
            {claimsQuery.isError ? (
              <ListErrorState
                title="Couldn't load this policy's claims"
                status={claimsQuery.error instanceof ApiError ? claimsQuery.error.status : 0}
                message={(claimsQuery.error as Error)?.message}
                onRetry={() => void claimsQuery.refetch()}
              />
            ) : (
              <ParityTable
                rows={claims}
                columns={claimColumns}
                rowKey={(claim) => claim.id}
                loading={claimsQuery.isPending || (claimsQuery.isFetching && claims.length === 0)}
                storageKey="insurance-policy-claims"
                emptyText="No claims attached to this policy."
              />
            )}
          </div>
        </div>

        <div className="rounded-sm border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Lawsuits (INS-06)</h3>
          <div className="mt-2">
            {lawsuitsQuery.isError ? (
              <ListErrorState
                title="Couldn't load this policy's lawsuits"
                status={lawsuitsQuery.error instanceof ApiError ? lawsuitsQuery.error.status : 0}
                message={(lawsuitsQuery.error as Error)?.message}
                onRetry={() => void lawsuitsQuery.refetch()}
              />
            ) : (
              <ParityTable
                rows={lawsuitRows}
                columns={lawsuitColumns}
                rowKey={(row) => row.id}
                loading={lawsuitsQuery.isPending || (lawsuitsQuery.isFetching && lawsuitRows.length === 0)}
                storageKey="insurance-policy-lawsuits"
                emptyText="No lawsuits linked to this policy's claims."
              />
            )}
          </div>
        </div>
      </section>

      <ConfirmModal
        open={Boolean(pendingArchive)}
        title="Archive this policy?"
        message="This removes the policy from active workflows while retaining its historical record and reverse links."
        confirmLabel="Archive policy"
        danger
        onClose={() => setPendingArchive(null)}
        onConfirm={async () => {
          if (!pendingArchive) return;
          await archiveMutation.mutateAsync(pendingArchive);
        }}
      />
    </div>
  );
}

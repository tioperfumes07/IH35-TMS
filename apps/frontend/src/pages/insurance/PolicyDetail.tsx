import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  archiveInsurancePolicy,
  getInsurancePolicy,
  listInsuranceClaims,
  listInsuranceCoiRequests,
  listInsuranceLawsuits,
  listInsurancePaymentSchedule,
  updateInsurancePolicy,
  type InsurancePolicyStatus,
} from "../../api/insurance";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

function formatMoney(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const policyQuery = useQuery({
    queryKey: ["insurance", "policy", policyId, companyId],
    enabled: Boolean(companyId && policyId),
    queryFn: () => getInsurancePolicy(policyId!, companyId),
  });

  const claimsQuery = useQuery({
    queryKey: ["insurance", "policy", "claims", companyId, policyId],
    enabled: Boolean(companyId && policyId),
    queryFn: () => listInsuranceClaims({ operating_company_id: companyId, policy_id: policyId }).then((result) => result.claims),
  });

  const paymentScheduleQuery = useQuery({
    queryKey: ["insurance", "policy", "payment-schedule", companyId, policyId],
    enabled: Boolean(companyId && policyId),
    queryFn: () =>
      listInsurancePaymentSchedule({ operating_company_id: companyId, policy_id: policyId }).then((result) => result.payment_schedules),
  });

  const coiQuery = useQuery({
    queryKey: ["insurance", "policy", "coi", companyId, policyId],
    enabled: Boolean(companyId && policyId),
    queryFn: () => listInsuranceCoiRequests({ operating_company_id: companyId }).then((result) => result.requests),
  });

  const lawsuitsQuery = useQuery({
    queryKey: ["insurance", "policy", "lawsuits", companyId, policyId],
    enabled: Boolean(companyId && policyId),
    queryFn: () => listInsuranceLawsuits({ operating_company_id: companyId }).then((result) => result.lawsuits),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { status: InsurancePolicyStatus; effective_date: string; expiry_date: string }) =>
      updateInsurancePolicy(policyId!, companyId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["insurance", "policy", policyId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ["insurance", "policies", companyId] });
      pushToast("Policy updated", "success");
      setEditing(false);
    },
    onError: () => pushToast("Failed to update policy", "error"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveInsurancePolicy(policyId!, companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["insurance", "policies", companyId] });
      pushToast("Policy archived", "success");
      navigate("/safety/insurance/policies");
    },
    onError: () => pushToast("Failed to archive policy", "error"),
  });

  const claims = claimsQuery.data ?? [];
  const claimIds = useMemo(() => new Set(claims.map((claim) => claim.id)), [claims]);
  const coiRows = useMemo(() => (coiQuery.data ?? []).filter((row) => row.policy_id === policyId), [coiQuery.data, policyId]);
  const lawsuitRows = useMemo(
    () => (lawsuitsQuery.data ?? []).filter((lawsuit) => lawsuit.claim_id && claimIds.has(lawsuit.claim_id)),
    [claimIds, lawsuitsQuery.data]
  );

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to view policy details.</div>;
  }

  if (!policyId) {
    return <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">Missing policy ID.</div>;
  }

  if (policyQuery.isLoading) {
    return <div className="text-sm text-slate-500">Loading policy details...</div>;
  }

  if (policyQuery.isError || !policyQuery.data) {
    return <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">Failed to load policy details.</div>;
  }

  const policy = policyQuery.data;

  const openEditPanel = () => {
    setStatus(policy.status);
    setEffectiveDate(policy.effective_date);
    setExpiryDate(policy.expiry_date);
    setEditing(true);
  };

  const handleArchive = () => {
    if (!policyId || archiveMutation.isPending) return;
    const confirmed = window.confirm("Archive this policy? This action cannot be undone.");
    if (!confirmed) return;
    archiveMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <header className="rounded border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <button type="button" className="text-xs text-blue-700 underline" onClick={() => navigate("/safety/insurance/policies")}>
              Back to policies
            </button>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Policy {policy.policy_number}</h2>
            <p className="mt-1 text-xs text-slate-600">
              {policy.insurer_name} · {policy.coverage_type} · {policy.status}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={openEditPanel}>
              Edit / Update
            </Button>
            <Button size="sm" variant="tertiary" loading={archiveMutation.isPending} onClick={handleArchive}>
              Archive
            </Button>
          </div>
        </div>

        {editing ? (
          <div className="mt-3 grid gap-2 rounded border border-gray-200 bg-gray-50 p-3 md:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600">
              Status
              <select
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                value={status}
                onChange={(event) => setStatus(event.target.value as InsurancePolicyStatus)}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Effective date
              <input
                type="date"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Expiry date
              <input
                type="date"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button
                size="sm"
                loading={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ status, effective_date: effectiveDate, expiry_date: expiryDate })}
              >
                Save
              </Button>
              <Button size="sm" variant="tertiary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Units Assigned</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Unit</th>
                <th className="px-2 py-1.5 font-semibold">Insured Value</th>
                <th className="px-2 py-1.5 font-semibold">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {policy.units.map((unit) => (
                <tr key={unit.id} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-slate-700">
                    <Link className="text-blue-700 underline" to={`/fleet/units/${unit.asset_id}`}>
                      {unit.asset_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-slate-700">{formatMoney(unit.insured_value_cents)}</td>
                  <td className="px-2 py-1.5 text-slate-700">{unit.created_at.slice(0, 10)}</td>
                </tr>
              ))}
              {policy.units.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                    No units assigned.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Payment Schedule (INS-05)</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Due Date</th>
                <th className="px-2 py-1.5 font-semibold">Amount</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {(paymentScheduleQuery.data ?? []).map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-slate-700">{row.due_date}</td>
                  <td className="px-2 py-1.5 text-slate-700">{formatMoney(row.amount_cents)}</td>
                  <td className="px-2 py-1.5 text-slate-700">{row.status}</td>
                </tr>
              ))}
              {!paymentScheduleQuery.isLoading && (paymentScheduleQuery.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                    No payment schedule records.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">COI History (INS-04)</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Requested</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
                <th className="px-2 py-1.5 font-semibold">Document</th>
              </tr>
            </thead>
            <tbody>
              {coiRows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-slate-700">{row.requested_at.slice(0, 10)}</td>
                  <td className="px-2 py-1.5 text-slate-700">{row.status}</td>
                  <td className="px-2 py-1.5 text-slate-700">{row.document_url ? <a href={row.document_url} className="text-blue-700 underline">View</a> : "-"}</td>
                </tr>
              ))}
              {!coiQuery.isLoading && coiRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                    No COI requests linked to this policy.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Claims (INS-06)</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Claim #</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                  <th className="px-2 py-1.5 font-semibold">Claimed</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 text-slate-700">{claim.claim_number}</td>
                    <td className="px-2 py-1.5 text-slate-700">{claim.status}</td>
                    <td className="px-2 py-1.5 text-slate-700">{formatMoney(claim.amount_claimed_cents)}</td>
                  </tr>
                ))}
                {!claimsQuery.isLoading && claims.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                      No claims attached to this policy.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Lawsuits (INS-06)</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Case #</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                  <th className="px-2 py-1.5 font-semibold">Demand</th>
                </tr>
              </thead>
              <tbody>
                {lawsuitRows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 text-slate-700">{row.case_number}</td>
                    <td className="px-2 py-1.5 text-slate-700">{row.status}</td>
                    <td className="px-2 py-1.5 text-slate-700">{formatMoney(row.demand_cents)}</td>
                  </tr>
                ))}
                {!lawsuitsQuery.isLoading && lawsuitRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                      No lawsuits linked to this policy's claims.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

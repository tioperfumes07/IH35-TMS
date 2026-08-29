import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getIftaFilingDraft,
  listIftaFilings,
  markIftaFilingFiled,
  ownerApproveIftaFiling,
  prepareIftaFiling,
  updateIftaFilingOverrides,
} from "../../../api/reports-ifta";
import { useAuth } from "../../../auth/useAuth";
import { StepWizard } from "../../../components/reports/ifta/StepWizard";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useToast } from "../../../components/Toast";
import { filingQuarterLabel, recentQuarterOptions, toQuarterLabel } from "../ifta/quarter";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  review: "Under review",
  filed: "Filed",
};

export function IftaPreparer() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const auth = useAuth();
  const isOwner = auth.user?.role === "Owner";
  // COMP-1: default to the quarter being FILED (most recently closed), not the
  // current calendar quarter — and let the user pick the target quarter. Preparing
  // during April must file Q1, not the current calendar quarter (Q2).
  const [quarter, setQuarter] = useState(() => filingQuarterLabel());
  const quarterOptions = useMemo(() => recentQuarterOptions(8), []);
  const queryClient = useQueryClient();
  const [filingUuid, setFilingUuid] = useState<string | null>(null);
  const { pushToast } = useToast();

  const historyQuery = useQuery({
    queryKey: ["reports-ifta-filings", companyId],
    queryFn: () => listIftaFilings(companyId),
    enabled: Boolean(companyId),
  });

  const filingQuery = useQuery({
    queryKey: ["reports-ifta-filing", companyId, filingUuid],
    queryFn: () => getIftaFilingDraft(companyId, filingUuid!),
    enabled: Boolean(companyId && filingUuid),
  });

  // GO-0028: none of these 4 mutations had an onError handler, and every call site discards the
  // promise with `void`/no try-catch (see StepWizard's Step1/Step2/Step4 children) -- a failed
  // "Prepare filing", overrides save, OWNER APPROVAL, or "mark as filed" click reverted its button
  // to normal with zero signal that anything went wrong. On a live, routed, compliance-critical
  // filing wizard that includes an owner-approval step, that is a silent-failure dead click on a
  // regulated action. Matches this app's established pushToast(...,"error") pattern.
  const prepareMutation = useMutation({
    mutationFn: () => prepareIftaFiling(companyId, quarter),
    onSuccess: (data) => {
      setFilingUuid(String(data.uuid));
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filings", companyId] });
    },
    onError: () => pushToast(`Failed to prepare ${quarter} filing — nothing was created. Please retry.`, "error"),
  });

  const overridesMutation = useMutation({
    mutationFn: (body: { miles_overrides?: Record<string, number>; fuel_overrides?: Record<string, number> }) =>
      updateIftaFilingOverrides(companyId, filingUuid!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filing", companyId, filingUuid] });
    },
    onError: () => pushToast("Failed to save overrides — your changes were not saved. Please retry.", "error"),
  });

  const approveMutation = useMutation({
    mutationFn: (payload: { wf064_confirm: true; confirm_phrase: "APPROVE"; hold_seconds_elapsed: number }) =>
      ownerApproveIftaFiling(companyId, filingUuid!, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filing", companyId, filingUuid] });
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filings", companyId] });
    },
    onError: () => pushToast("Owner approval failed — the filing was NOT approved. Please retry.", "error"),
  });

  const markFiledMutation = useMutation({
    mutationFn: (confirmationNumber: string) => markIftaFilingFiled(companyId, filingUuid!, confirmationNumber),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filing", companyId, filingUuid] });
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filings", companyId] });
    },
    onError: () => pushToast("Failed to record this filing as filed — please retry.", "error"),
  });

  const filing = filingQuery.data;

  return (
    <div className="space-y-3">
      <PageHeader
        title="IFTA Quarterly Preparer"
        subtitle={`${quarter} · 4-step wizard (mileage, fuel, tax, final review)`}
        backHref="/reports"
        breadcrumb={["Reports", "IFTA Quarterly Preparer"]}
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Tax filing prep only — no ledger posting. Rates sourced from the IFTA tax matrix catalog (annual updates).
      </p>

      {!filingUuid ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            Filing quarter
            <select
              aria-label="Filing quarter"
              value={quarter}
              onChange={(event) => setQuarter(event.target.value)}
              disabled={!companyId || prepareMutation.isPending}
              className="rounded-sm border border-slate-300 px-2 py-1.5 text-xs font-normal text-slate-900 disabled:opacity-50"
            >
              {quarterOptions.map((option) => {
                const label = toQuarterLabel(option);
                return (
                  <option key={label} value={label}>
                    Q{option.quarter} {option.year}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            className="rounded-sm border border-slate-400 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-50"
            disabled={!companyId || prepareMutation.isPending}
            onClick={() => {
              // onError above already surfaces the toast; .catch() here only prevents an
              // unhandled-promise-rejection console error from this fire-and-forget click.
              void prepareMutation.mutateAsync().catch(() => {});
            }}
            data-testid="ifta-prepare-quarter"
          >
            {prepareMutation.isPending ? "Preparing…" : `Prepare ${quarter} filing`}
          </button>
        </div>
      ) : null}

      {historyQuery.data?.filings?.length ? (
        <div className="rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs">
          <p className="mb-1 font-semibold text-slate-700">Filing history</p>
          <ul className="space-y-1">
            {historyQuery.data.filings.map((row) => (
              <li key={row.uuid}>
                <button
                  type="button"
                  className="text-left text-slate-700 underline"
                  onClick={() => setFilingUuid(row.uuid)}
                >
                  {row.quarter} · {STATUS_LABELS[row.status] ?? row.status}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {filing ? (
        <StepWizard
          filing={filing}
          isOwner={isOwner}
          onSaveMilesOverrides={async (miles_overrides) => {
            await overridesMutation.mutateAsync({ miles_overrides });
          }}
          onSaveFuelOverrides={async (fuel_overrides) => {
            await overridesMutation.mutateAsync({ fuel_overrides });
          }}
          onOwnerApprove={async (payload) => {
            await approveMutation.mutateAsync(payload);
          }}
          onMarkFiled={async (confirmationNumber) => {
            await markFiledMutation.mutateAsync(confirmationNumber);
          }}
          savingOverrides={overridesMutation.isPending}
          approving={approveMutation.isPending}
          filingPending={markFiledMutation.isPending}
        />
      ) : null}
    </div>
  );
}

export default IftaPreparer;

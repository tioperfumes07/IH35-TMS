import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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

function currentQuarterLabel(now = new Date()) {
  const month = now.getUTCMonth();
  const quarter = Math.floor(month / 3) + 1;
  const year = now.getUTCFullYear();
  return `${year}-Q${quarter}`;
}

export function IftaPreparer() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const auth = useAuth();
  const isOwner = auth.user?.role === "Owner";
  const quarter = useMemo(() => currentQuarterLabel(), []);
  const queryClient = useQueryClient();
  const [filingUuid, setFilingUuid] = useState<string | null>(null);

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

  const prepareMutation = useMutation({
    mutationFn: () => prepareIftaFiling(companyId, quarter),
    onSuccess: (data) => {
      setFilingUuid(String(data.uuid));
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filings", companyId] });
    },
  });

  const overridesMutation = useMutation({
    mutationFn: (body: { miles_overrides?: Record<string, number>; fuel_overrides?: Record<string, number> }) =>
      updateIftaFilingOverrides(companyId, filingUuid!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filing", companyId, filingUuid] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (payload: { wf064_confirm: true; confirm_phrase: "APPROVE"; hold_seconds_elapsed: number }) =>
      ownerApproveIftaFiling(companyId, filingUuid!, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filing", companyId, filingUuid] });
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filings", companyId] });
    },
  });

  const markFiledMutation = useMutation({
    mutationFn: (confirmationNumber: string) => markIftaFilingFiled(companyId, filingUuid!, confirmationNumber),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filing", companyId, filingUuid] });
      void queryClient.invalidateQueries({ queryKey: ["reports-ifta-filings", companyId] });
    },
  });

  const filing = filingQuery.data;

  return (
    <div className="space-y-3">
      <PageHeader
        title="IFTA Quarterly Preparer"
        subtitle={`${quarter} · 4-step wizard (mileage, fuel, tax, owner approval)`}
        actions={
          <Link to="/reports" className="text-xs font-semibold text-slate-700 hover:underline">
            ← Reports
          </Link>
        }
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Tax filing prep only — no ledger posting. Rates sourced from the IFTA tax matrix catalog (annual updates).
      </p>

      {!filingUuid ? (
        <button
          type="button"
          className="rounded border border-amber-400 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
          disabled={!companyId || prepareMutation.isPending}
          onClick={() => void prepareMutation.mutateAsync()}
          data-testid="ifta-prepare-quarter"
        >
          {prepareMutation.isPending ? "Preparing…" : `Prepare ${quarter} filing`}
        </button>
      ) : null}

      {historyQuery.data?.filings?.length ? (
        <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs">
          <p className="mb-1 font-semibold text-slate-700">Filing history</p>
          <ul className="space-y-1">
            {historyQuery.data.filings.map((row) => (
              <li key={row.uuid}>
                <button
                  type="button"
                  className="text-left text-blue-700 underline"
                  onClick={() => setFilingUuid(row.uuid)}
                >
                  {row.quarter} · {row.status}
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

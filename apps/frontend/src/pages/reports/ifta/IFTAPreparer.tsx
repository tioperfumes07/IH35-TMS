import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createIftaPreparation } from "../../../api/ifta";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { IFTAStepGallons } from "./IFTAStepGallons";
import { IFTAStepMiles } from "./IFTAStepMiles";

function currentQuarterYear(now = new Date()) {
  const month = now.getUTCMonth();
  return { quarter: Math.floor(month / 3) + 1, year: now.getUTCFullYear() };
}

export function IFTAPreparer() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { quarter, year } = useMemo(() => currentQuarterYear(), []);
  const [preparationId, setPreparationId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createIftaPreparation(companyId, { quarter, year }),
    onSuccess: (data) => setPreparationId(String(data.id)),
  });

  const prepReady = Boolean(preparationId);

  return (
    <div className="space-y-3">
      <PageHeader
        title="IFTA Quarterly Preparer"
        subtitle={`Q${quarter} ${year} · Steps 1–2 (miles + gallons)`}
        actions={
          <Link to="/reports" className="text-xs font-semibold text-slate-700 hover:underline">
            ← Reports
          </Link>
        }
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        This report is always accrual basis per CPA sign-off. Tax calculation and CSV export ship in P6-T3.
      </p>

      {!prepReady ? (
        <button
          type="button"
          className="rounded border border-amber-400 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
          disabled={!companyId || createMutation.isPending}
          onClick={() => void createMutation.mutateAsync()}
        >
          {createMutation.isPending ? "Creating…" : `Create Q${quarter} ${year} preparation`}
        </button>
      ) : null}

      {prepReady && preparationId ? (
        <div className="space-y-3">
          <IFTAStepMiles operatingCompanyId={companyId} preparationId={preparationId} quarter={quarter} year={year} />
          <IFTAStepGallons operatingCompanyId={companyId} preparationId={preparationId} quarter={quarter} year={year} />
        </div>
      ) : null}
    </div>
  );
}

export default IFTAPreparer;

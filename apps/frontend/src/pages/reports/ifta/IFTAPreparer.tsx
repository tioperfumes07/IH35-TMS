import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createIftaPreparation } from "../../../api/ifta";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { IFTAStepCSVExport } from "./IFTAStepCSVExport";
import { IFTAStepGallons } from "./IFTAStepGallons";
import { IFTAStepMiles } from "./IFTAStepMiles";
import { IFTAStepTax } from "./IFTAStepTax";
import { filingQuarterLabel, parseQuarterLabel, recentQuarterOptions, toQuarterLabel } from "./quarter";

export function IFTAPreparer() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // COMP-1: default to the quarter being FILED (most recently closed), not the
  // current calendar quarter. Filing Q1 during April must target Q1, not Q2.
  const [selectedLabel, setSelectedLabel] = useState(() => filingQuarterLabel());
  const { quarter, year } = useMemo(() => parseQuarterLabel(selectedLabel), [selectedLabel]);
  const quarterOptions = useMemo(() => recentQuarterOptions(8), []);
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
        subtitle={`Q${quarter} ${year} · Steps 1–4 (miles, gallons, tax, CSV)`}
        actions={
          <Link to="/reports" className="text-xs font-semibold text-slate-700 hover:underline">
            ← Reports
          </Link>
        }
      />

      {!companyId ? <p className="text-xs text-red-600">Select an operating company.</p> : null}

      <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Tax filing prep only — no ledger posting. Accrual basis under the owner-locked reporting policy. Run Steps 1→4 in
        order; CSV uploads to secure storage with signed download.
      </p>

      {!prepReady ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            Filing quarter
            <select
              aria-label="Filing quarter"
              value={selectedLabel}
              onChange={(event) => setSelectedLabel(event.target.value)}
              disabled={!companyId || createMutation.isPending}
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
            disabled={!companyId || createMutation.isPending}
            onClick={() => void createMutation.mutateAsync()}
          >
            {createMutation.isPending ? "Creating…" : `Create Q${quarter} ${year} preparation`}
          </button>
        </div>
      ) : null}

      {prepReady && preparationId ? (
        <div className="space-y-3">
          <IFTAStepMiles operatingCompanyId={companyId} preparationId={preparationId} quarter={quarter} year={year} />
          <IFTAStepGallons operatingCompanyId={companyId} preparationId={preparationId} quarter={quarter} year={year} />
          <IFTAStepTax operatingCompanyId={companyId} preparationId={preparationId} quarter={quarter} year={year} />
          <IFTAStepCSVExport operatingCompanyId={companyId} preparationId={preparationId} quarter={quarter} year={year} />
        </div>
      ) : null}
    </div>
  );
}

export default IFTAPreparer;

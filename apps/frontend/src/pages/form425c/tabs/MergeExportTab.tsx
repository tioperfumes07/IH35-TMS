import { suggestedFilename } from "../lib/buildPrintHTML";
import { MONTHS } from "../lib/constants";
import type { CompanyProfile } from "../types";

type Props = {
  company: CompanyProfile;
  month: number;
  year: number;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => void;
};

export function MergeExportTab({ company, month, year, canGenerate, generating, onGenerate }: Props) {
  return (
    <div className="space-y-3 p-4">
      <div className="rounded border bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Build Complete Report Package</div>
        <p className="mt-2 text-xs text-slate-600">
          Generates filing HTML and opens browser print dialog. Use browser destination <strong>Save as PDF</strong>.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Suggested filename: <em>{suggestedFilename(company.name, month, year)}</em>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Period: {MONTHS[month]} {year}
        </p>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate || generating}
          className="mt-3 rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate Filing HTML + Print PDF"}
        </button>
      </div>
    </div>
  );
}


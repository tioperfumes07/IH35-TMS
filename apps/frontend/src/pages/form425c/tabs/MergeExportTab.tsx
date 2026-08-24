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
      <div className="rounded-sm border bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Build Complete Report Package</div>
        <p className="mt-2 text-xs text-slate-600">
          Prints the current MOR without changing status or writing a filing PDF. Use{" "}
          <strong>Generate PDF</strong> on Form 425C to create the court artifact and mark ready to
          file. Browser destination <strong>Save as PDF</strong>.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Suggested filename:{" "}
          {suggestedFilename(company.name, month, year) ? (
            <em>{suggestedFilename(company.name, month, year)}</em>
          ) : (
            <em className="font-semibold text-red-700">Set the debtor name in Profiles before a court filename</em>
          )}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Period: {MONTHS[month]} {year}
        </p>
        {!canGenerate ? (
          <p className="mt-2 text-xs font-semibold text-red-700">
            Create / Load Draft before generating the filing package — the button still explains on click.
          </p>
        ) : null}
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="mt-3 rounded-sm bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate Filing HTML + Print PDF"}
        </button>
      </div>
    </div>
  );
}


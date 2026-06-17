import { useMemo, useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../../api/client";
import { ExhibitCard } from "../../../components/form-425c/ExhibitCard";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useToast } from "../../../components/Toast";

type ExhibitLetter = "a" | "b" | "c" | "d" | "e" | "f";

type BuiltExhibits = {
  filing_uuid: string;
  period_start: string;
  period_end: string;
  exhibits: Record<ExhibitLetter, Record<string, unknown>>;
};

const EXHIBIT_META: Array<{ letter: ExhibitLetter; title: string; summary: string }> = [
  { letter: "a", title: "Cash receipts", summary: "Receipts grouped by source type" },
  { letter: "b", title: "Cash disbursements", summary: "Outgoing payments by vendor and category" },
  { letter: "c", title: "Bank reconciliation", summary: "Opening, activity, and closing per DIP account" },
  { letter: "d", title: "Trustee quarterly fee", summary: "28 U.S.C. § 1930(a)(6) tier calculation" },
  { letter: "e", title: "Statements summary", summary: "P&L, balance sheet, and cash flow snapshots" },
  { letter: "f", title: "Supporting documents", summary: "Invoices and bills with evidence references" },
];

function defaultPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
  };
}

export function ExhibitsViewer() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const [period, setPeriod] = useState(defaultPeriod);
  const [activeLetter, setActiveLetter] = useState<ExhibitLetter>("a");
  const [built, setBuilt] = useState<BuiltExhibits | null>(null);

  const buildMut = useMutation({
    mutationFn: () =>
      apiRequest<BuiltExhibits>("/api/v1/reports/form-425c/exhibits/build", {
        method: "POST",
        body: {
          operating_company_id: companyId,
          period_start: period.period_start,
          period_end: period.period_end,
        },
      }),
    onSuccess: (data) => {
      setBuilt(data);
      pushToast("Exhibits A–F built", "success");
    },
    onError: () => pushToast("Exhibit build failed", "error"),
  });

  const activeExhibit = useMemo(() => {
    if (!built) return null;
    return built.exhibits[activeLetter] ?? null;
  }, [built, activeLetter]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Form 425C Exhibits A–F</h1>
          <p className="text-sm text-slate-600">Auto-build court-ready supporting exhibits for TRANSP monthly DIP filings.</p>
        </div>
        <Link to="/425c" className="text-sm font-semibold text-[#1f2a44] hover:underline">
          ← Back to Form 425C
        </Link>
      </div>

      <section className="rounded border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Period start
            <DatePicker
              className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
              value={period.period_start}
              onChange={(next) => setPeriod((p) => ({ ...p, period_start: next }))}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Period end
            <DatePicker
              className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
              value={period.period_end}
              onChange={(next) => setPeriod((p) => ({ ...p, period_end: next }))}
            />
          </label>
          <button
            type="button"
            disabled={!companyId || buildMut.isPending}
            onClick={() => buildMut.mutate()}
            className="rounded bg-[#1f2a44] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {buildMut.isPending ? "Building…" : "Build all exhibits"}
          </button>
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {EXHIBIT_META.map((meta) => (
          <ExhibitCard
            key={meta.letter}
            letter={meta.letter}
            title={meta.title}
            summary={meta.summary}
            active={activeLetter === meta.letter}
            onSelect={() => setActiveLetter(meta.letter)}
          />
        ))}
      </div>

      <section className="rounded border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Exhibit {activeLetter.toUpperCase()} preview</h2>
          {built ? (
            <button
              type="button"
              className="text-xs font-semibold text-[#1f2a44] hover:underline"
              onClick={() => {
                const blob = new Blob([JSON.stringify(activeExhibit, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `form-425c-exhibit-${activeLetter}-${built.period_end}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export JSON
            </button>
          ) : null}
        </div>
        {!built ? (
          <p className="text-sm text-slate-500">Build exhibits to preview tab content.</p>
        ) : (
          <pre className="max-h-[420px] overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-800">
            {JSON.stringify(activeExhibit, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

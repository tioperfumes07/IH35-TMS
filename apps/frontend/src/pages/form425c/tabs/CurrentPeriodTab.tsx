import { MONTHS, QUESTIONNAIRE, YEARS } from "../lib/constants";
import type { CompanyKey, CompanyProfiles, CurrentFormState } from "../types";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  activeCompany: CompanyKey;
  setActiveCompany: (company: CompanyKey) => void;
  month: number;
  year: number;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  profiles: CompanyProfiles;
  form: CurrentFormState;
  setForm: (updater: (prev: CurrentFormState) => CurrentFormState) => void;
  onCreateOrLoad: () => void;
  onImportBanking: () => void;
  onSave: () => void;
  onGeneratePdf: () => void;
  onMarkFiled: () => void;
  loading: boolean;
  autoSaveLabel: string;
};

function nv(s: string) {
  return parseFloat(String(s || "").replace(/[$,]/g, "")) || 0;
}

export function CurrentPeriodTab({
  activeCompany,
  setActiveCompany,
  month,
  year,
  setMonth,
  setYear,
  profiles,
  form,
  setForm,
  onCreateOrLoad,
  onImportBanking,
  onSave,
  onGeneratePdf,
  onMarkFiled,
  loading,
  autoSaveLabel,
}: Props) {
  const netCash = nv(form.totalReceipts) - nv(form.totalDisbursements);
  const cashEnd = nv(form.openingBalance) + netCash;
  const projNetPrev = nv(form.projReceiptsLast) - nv(form.projDisbLast);
  const pDR = nv(form.projReceiptsLast) - nv(form.totalReceipts);
  const pDD = nv(form.projDisbLast) - nv(form.totalDisbursements);
  const pDN = projNetPrev - netCash;
  const projNetNext = nv(form.projReceiptsNext) - nv(form.projDisbNext);

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <label className="text-xs font-semibold uppercase text-slate-600">
          Company
          <SelectCombobox className="mt-1 w-full rounded border px-2 py-1.5 text-sm normal-case" value={activeCompany} onChange={(e) => setActiveCompany(e.target.value as CompanyKey)}>
            <option value="trucking">{profiles.trucking.name}</option>
            <option value="transportation">{profiles.transportation.name}</option>
          </SelectCombobox>
        </label>
        <label className="text-xs font-semibold uppercase text-slate-600">
          Month
          <SelectCombobox className="mt-1 w-full rounded border px-2 py-1.5 text-sm normal-case" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="text-xs font-semibold uppercase text-slate-600">
          Year
          <SelectCombobox className="mt-1 w-full rounded border px-2 py-1.5 text-sm normal-case" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <button type="button" onClick={onCreateOrLoad} className="self-end rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
          Create / Load Draft
        </button>
        <button type="button" onClick={onImportBanking} className="self-end rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white" disabled={!form.reportId || loading}>
          ⟳ Import from Banking
        </button>
        <div className="self-end text-xs text-slate-500">{autoSaveLabel}</div>
      </div>

      <div className="rounded border bg-slate-50 p-3 text-xs text-slate-700">
        <strong>{profiles[activeCompany].name}</strong> · Case #{profiles[activeCompany].caseNumber || "—"} · Court {profiles[activeCompany].division},{" "}
        {profiles[activeCompany].district} · Petition date is managed by report creation.
      </div>

      <div className="rounded border bg-white">
        <div className="border-b bg-slate-800 px-3 py-2 text-sm font-semibold text-white">Part 1 — Questionnaire (Lines 1-18)</div>
        {QUESTIONNAIRE.map((q, i) => {
          const answer = form.answers[q.num] ?? (q.expectYes ? "yes" : "no");
          const flagged = (q.expectYes && answer === "no") || (!q.expectYes && answer === "yes");
          return (
            <div key={q.num}>
              {i === 9 ? <div className="border-b bg-slate-100 px-3 py-1 text-xs italic text-slate-600">Lines 10-18: if Yes, Exhibit B entry required.</div> : null}
              <div className={`grid grid-cols-[24px_1fr_auto] items-center gap-2 border-b px-3 py-2 text-sm ${flagged ? "bg-red-50" : ""}`}>
                <span className="font-semibold text-slate-500">{q.num}.</span>
                <span className={flagged ? "text-red-700" : ""}>{q.text}</span>
                <div className="flex gap-2">
                  {(["yes", "no", "na"] as const).map((v) => (
                    <label key={v} className="flex items-center gap-1 text-xs uppercase text-slate-600">
                      <input
                        type="radio"
                        checked={answer === v}
                        onChange={() =>
                          setForm((prev) => ({
                            ...prev,
                            answers: { ...prev.answers, [q.num]: v },
                          }))
                        }
                      />
                      {v}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded border bg-white">
        <div className="border-b bg-emerald-800 px-3 py-2 text-sm font-semibold text-white">Part 2 — Summary of Cash Activity (Lines 19-23)</div>
        {[
          ["19", "openingBalance", "Total opening balance of all accounts"],
          ["20", "totalReceipts", "Total cash receipts"],
          ["21", "totalDisbursements", "Total cash disbursements"],
        ].map(([line, key, label]) => (
          <label key={key} className="grid grid-cols-[1fr_220px] items-center gap-2 border-b px-3 py-2 text-sm">
            <span>
              <strong>{line}.</strong> {label}
            </span>
            <input
              className="rounded border px-2 py-1.5 text-right"
              value={String((form as unknown as Record<string, string>)[key] ?? "")}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </label>
        ))}
        <div className="grid grid-cols-[1fr_220px] items-center gap-2 border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
          <span>22. Net cash flow (20 - 21)</span>
          <span className="text-right">${netCash.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-[1fr_220px] items-center gap-2 bg-slate-50 px-3 py-2 text-sm font-semibold">
          <span>23. Cash on hand at end of month (19 + 22)</span>
          <span className="text-right">${cashEnd.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          ["24", "totalPayables", "Total payables (Exhibit E)"],
          ["25", "totalReceivables", "Total receivables (Exhibit F)"],
          ["26", "numEmployeesAtFiling", "Employees at filing"],
          ["27", "numEmployeesNow", "Employees now"],
          ["28", "proFeesThisMonth", "Bankruptcy fees this month"],
          ["29", "proFeesSinceFiling", "Bankruptcy fees since filing"],
          ["30", "otherProFeesThisMonth", "Other professional fees this month"],
          ["31", "otherProFeesSinceFiling", "Other professional fees since filing"],
        ].map(([line, key, label]) => (
          <label key={key} className="rounded border bg-white px-3 py-2 text-sm">
            <strong>{line}.</strong> {label}
            <input
              className="mt-1 w-full rounded border px-2 py-1.5 text-right"
              value={String((form as unknown as Record<string, string>)[key] ?? "")}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      <div className="rounded border bg-white">
        <div className="border-b bg-[#1F2A44] px-3 py-2 text-sm font-semibold text-white">Part 7 — Projections (Lines 32-37)</div>
        {form.hasCarryForward ? (
          <div className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Column A came from previous month carry-forward. Manual edits require reason (30+ chars).
          </div>
        ) : null}
        <div className="grid grid-cols-[1fr_170px_170px_170px] border-b bg-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
          <span>Line</span>
          <span className="text-right">Column A Projected</span>
          <span className="text-right">Column B Actual</span>
          <span className="text-right">Column C Difference</span>
        </div>
        <div className="grid grid-cols-[1fr_170px_170px_170px] items-center border-b px-3 py-2 text-sm">
          <span>32. Cash receipts</span>
          <input className="rounded border px-2 py-1.5 text-right" value={form.projReceiptsLast} onChange={(e) => setForm((prev) => ({ ...prev, projReceiptsLast: e.target.value }))} />
          <span className="text-right">${nv(form.totalReceipts).toFixed(2)}</span>
          <span className="text-right">${pDR.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-[1fr_170px_170px_170px] items-center border-b px-3 py-2 text-sm">
          <span>33. Cash disbursements</span>
          <input className="rounded border px-2 py-1.5 text-right" value={form.projDisbLast} onChange={(e) => setForm((prev) => ({ ...prev, projDisbLast: e.target.value }))} />
          <span className="text-right">${nv(form.totalDisbursements).toFixed(2)}</span>
          <span className="text-right">${pDD.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-[1fr_170px_170px_170px] items-center border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
          <span>34. Net cash flow</span>
          <span className="text-right">${projNetPrev.toFixed(2)}</span>
          <span className="text-right">${netCash.toFixed(2)}</span>
          <span className="text-right">${pDN.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-[1fr_220px] items-center border-b px-3 py-2 text-sm">
          <span>35. Next month projected receipts</span>
          <input className="rounded border px-2 py-1.5 text-right" value={form.projReceiptsNext} onChange={(e) => setForm((prev) => ({ ...prev, projReceiptsNext: e.target.value }))} />
        </div>
        <div className="grid grid-cols-[1fr_220px] items-center border-b px-3 py-2 text-sm">
          <span>36. Next month projected disbursements</span>
          <input className="rounded border px-2 py-1.5 text-right" value={form.projDisbNext} onChange={(e) => setForm((prev) => ({ ...prev, projDisbNext: e.target.value }))} />
        </div>
        <div className="grid grid-cols-[1fr_220px] items-center bg-slate-50 px-3 py-2 text-sm font-semibold">
          <span>37. Next month projected net cash flow</span>
          <span className="text-right">${projNetNext.toFixed(2)}</span>
        </div>
        <label className="block border-t px-3 py-2 text-xs font-semibold uppercase text-slate-600">
          Override Reason (required for carry-forward overrides)
          <textarea
            className="mt-1 h-20 w-full rounded border px-2 py-1.5 text-sm normal-case"
            value={form.projectionOverrideReason}
            onChange={(e) => setForm((prev) => ({ ...prev, projectionOverrideReason: e.target.value }))}
          />
        </label>
      </div>

      <div className="rounded border bg-white">
        <div className="border-b bg-slate-800 px-3 py-2 text-sm font-semibold text-white">Part 8 — Attachments</div>
        {[
          ["att38", "38. Bank statements"],
          ["att39", "39. Bank reconciliation reports"],
          ["att40", "40. Financial reports (P&L / balance sheet)"],
          ["att41", "41. Budget / forecast reports"],
          ["att42", "42. Job costing / WIP reports"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 border-b px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean((form as unknown as Record<string, boolean>)[key])}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.checked }))}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSave} disabled={!form.reportId || loading} className="rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
          Save Draft
        </button>
        <button type="button" onClick={onGeneratePdf} disabled={!form.reportId || loading} className="rounded bg-[#1F2A44] px-3 py-2 text-sm font-semibold text-white">
          Save & Generate Filing PDF
        </button>
        <button type="button" onClick={onMarkFiled} disabled={!form.reportId || loading} className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
          Mark Filed
        </button>
      </div>
    </div>
  );
}


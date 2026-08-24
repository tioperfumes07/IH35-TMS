import { useState } from "react";
import { MONTHS, QUESTIONNAIRE, YEARS } from "../lib/constants";
import type { CompanyKey, CompanyProfiles, CurrentFormState } from "../types";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type ExhibitRow = Record<string, unknown> & { line_number?: number; explanation?: string };

type Props = {
  activeCompany: CompanyKey;
  setActiveCompany: (company: CompanyKey) => void;
  month: number;
  year: number;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  profiles: CompanyProfiles;
  availableCompanies: CompanyKey[];
  form: CurrentFormState;
  setForm: (updater: (prev: CurrentFormState) => CurrentFormState) => void;
  onCreateOrLoad: () => void;
  onImportBanking: () => void;
  onSave: () => void;
  onGeneratePdf: () => void;
  onMarkFiled: () => void;
  onAttachFile: (line: number, file: File) => void;
  exhibitA: ExhibitRow[];
  exhibitB: ExhibitRow[];
  onSaveExhibit: (line: number, explanation: string) => void;
  savingExhibit: boolean;
  attaching: boolean;
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
  availableCompanies,
  form,
  setForm,
  onCreateOrLoad,
  onImportBanking,
  onSave,
  onGeneratePdf,
  onMarkFiled,
  onAttachFile,
  exhibitA,
  exhibitB,
  onSaveExhibit,
  savingExhibit,
  attaching,
  loading,
  autoSaveLabel,
}: Props) {
  const [exhibitDrafts, setExhibitDrafts] = useState<Record<number, string>>({});
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
          <SelectCombobox className="mt-1 w-full rounded-sm border px-2 py-1.5 text-sm normal-case" value={activeCompany} onChange={(e) => setActiveCompany(e.target.value as CompanyKey)}>
            {availableCompanies.map((k) => (
              <option key={k} value={k}>
                {profiles[k].name}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="text-xs font-semibold uppercase text-slate-600">
          Month
          <SelectCombobox className="mt-1 w-full rounded-sm border px-2 py-1.5 text-sm normal-case" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="text-xs font-semibold uppercase text-slate-600">
          Year
          <SelectCombobox className="mt-1 w-full rounded-sm border px-2 py-1.5 text-sm normal-case" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <button type="button" onClick={onCreateOrLoad} className="self-end rounded-sm bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
          Create / Load Draft
        </button>
        <button type="button" onClick={onImportBanking} className="self-end rounded-sm bg-slate-700 px-3 py-2 text-sm font-semibold text-white" disabled={loading}>
          ⟳ Import from Banking
        </button>
        <div className="self-end text-xs text-slate-500">{autoSaveLabel}</div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-sm border bg-slate-50 p-3 text-xs text-slate-700 md:grid-cols-4">
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-500">Debtor</div>
          <div>{profiles[activeCompany].name}</div>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-500">Case Number</div>
          <div>{profiles[activeCompany].caseNumber || "—"}</div>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-500">Court</div>
          <div>
            {profiles[activeCompany].division}, {profiles[activeCompany].district}
          </div>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-500">Petition Date</div>
          <div>Managed by report creation</div>
        </div>
      </div>

      <div className="rounded-sm border bg-white">
        <div className="border-b bg-[#1f2a44] px-3 py-2 text-sm font-semibold text-white">Part 1 — Questionnaire (Lines 1-18)</div>
        {QUESTIONNAIRE.map((q, i) => {
          const answer = form.answers[q.num] ?? (q.expectYes ? "yes" : "no");
          const flagged = (q.expectYes && answer === "no") || (!q.expectYes && answer === "yes");
          const letter = q.num <= 9 ? "A" : "B";
          const saved = (q.num <= 9 ? exhibitA : exhibitB).filter((row) => Number(row.line_number) === q.num);
          return (
            <div key={q.num}>
              {i === 9 ? <div className="border-b bg-slate-100 px-3 py-1 text-xs italic text-slate-600">Lines 10-18: if Yes, Exhibit B entry required.</div> : null}
              <div className={`grid grid-cols-[24px_1fr_auto] items-center gap-2 border-b px-3 py-2 text-sm ${flagged ? "bg-slate-100" : ""}`}>
                <span className="font-semibold text-slate-500">{q.num}.</span>
                <span className="flex items-center gap-2">
                  {q.text}
                  {flagged ? (
                    <span className="rounded-sm bg-[#1f2a44] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                      Exhibit {letter} required
                    </span>
                  ) : null}
                </span>
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
              {flagged ? (
                <div className="space-y-2 border-b bg-slate-50 px-3 py-2" data-form425c-exhibit-line={q.num}>
                  {saved.length ? (
                    <ul className="list-disc pl-5 text-xs text-slate-700">
                      {saved.map((row, idx) => (
                        <li key={String(row.id ?? idx)}>{String(row.explanation ?? "")}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-600">No Exhibit {letter} explanation saved for line {q.num}.</p>
                  )}
                  <textarea
                    className="h-16 w-full rounded-sm border px-2 py-1.5 text-sm"
                    placeholder={`Exhibit ${letter} explanation (saved to the court filing)`}
                    value={exhibitDrafts[q.num] ?? ""}
                    onChange={(e) => setExhibitDrafts((prev) => ({ ...prev, [q.num]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="rounded-sm bg-slate-800 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={savingExhibit}
                    onClick={() => onSaveExhibit(q.num, exhibitDrafts[q.num] ?? "")}
                  >
                    {savingExhibit ? "Saving…" : `Save Exhibit ${letter} entry`}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-sm border bg-white">
        <div className="border-b bg-[#1f2a44] px-3 py-2 text-sm font-semibold text-white">Part 2 — Summary of Cash Activity (Lines 19-23)</div>
        <p className="border-b bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Lines 19–21 are imported from Banking (DIP real accounts). Save Draft does not write them — edit here was a silent no-op on the court filing.
        </p>
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
              className="rounded-sm border bg-slate-50 px-2 py-1.5 text-right"
              value={String((form as unknown as Record<string, string>)[key] ?? "")}
              readOnly
              aria-readonly="true"
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
          <label key={key} className="rounded-sm border bg-white px-3 py-2 text-sm">
            <strong>{line}.</strong> {label}
            <input
              className="mt-1 w-full rounded-sm border px-2 py-1.5 text-right"
              value={String((form as unknown as Record<string, string>)[key] ?? "")}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      <div className="rounded-sm border bg-white">
        <div className="border-b bg-[#1f2a44] px-3 py-2 text-sm font-semibold text-white">Part 7 — Projections (Lines 32-37)</div>
        {form.hasCarryForward ? (
          <div className="border-b bg-slate-100 px-3 py-2 text-xs text-slate-700">
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
          <input className="rounded-sm border px-2 py-1.5 text-right" value={form.projReceiptsLast} onChange={(e) => setForm((prev) => ({ ...prev, projReceiptsLast: e.target.value }))} />
          <span className="text-right">${nv(form.totalReceipts).toFixed(2)}</span>
          <span className="text-right">${pDR.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-[1fr_170px_170px_170px] items-center border-b px-3 py-2 text-sm">
          <span>33. Cash disbursements</span>
          <input className="rounded-sm border px-2 py-1.5 text-right" value={form.projDisbLast} onChange={(e) => setForm((prev) => ({ ...prev, projDisbLast: e.target.value }))} />
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
          <input className="rounded-sm border px-2 py-1.5 text-right" value={form.projReceiptsNext} onChange={(e) => setForm((prev) => ({ ...prev, projReceiptsNext: e.target.value }))} />
        </div>
        <div className="grid grid-cols-[1fr_220px] items-center border-b px-3 py-2 text-sm">
          <span>36. Next month projected disbursements</span>
          <input className="rounded-sm border px-2 py-1.5 text-right" value={form.projDisbNext} onChange={(e) => setForm((prev) => ({ ...prev, projDisbNext: e.target.value }))} />
        </div>
        <div className="grid grid-cols-[1fr_220px] items-center bg-slate-50 px-3 py-2 text-sm font-semibold">
          <span>37. Next month projected net cash flow</span>
          <span className="text-right">${projNetNext.toFixed(2)}</span>
        </div>
        <label className="block border-t px-3 py-2 text-xs font-semibold uppercase text-slate-600">
          Override Reason (required for carry-forward overrides)
          <textarea
            className="mt-1 h-20 w-full rounded-sm border px-2 py-1.5 text-sm normal-case"
            value={form.projectionOverrideReason}
            onChange={(e) => setForm((prev) => ({ ...prev, projectionOverrideReason: e.target.value }))}
          />
        </label>
      </div>

      <div className="rounded-sm border bg-white">
        <div className="border-b bg-[#1f2a44] px-3 py-2 text-sm font-semibold text-white">Part 8 — Attachments</div>
        {[
          ["att38", 38, "Bank statements"],
          ["att39", 39, "Bank reconciliation reports"],
          ["att40", 40, "Financial reports (P&L / balance sheet)"],
          ["att41", 41, "Budget / forecast reports"],
          ["att42", 42, "Job costing / WIP reports"],
        ].map(([key, line, label]) => {
          const attached = Boolean((form as unknown as Record<string, boolean>)[key as string]);
          const inputId = `form425c-attach-${key}`;
          return (
            <div key={key as string} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                {/* Checked state is derived from an actually-uploaded file — never manually settable. */}
                <input type="checkbox" checked={attached} disabled readOnly />
                <span>
                  {line}. {label}
                </span>
                {attached ? <span className="text-xs font-semibold text-slate-700">Attached</span> : null}
              </span>
              <label htmlFor={inputId} className="rounded-sm border px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                {attaching ? "Uploading…" : attached ? "Attach another" : "Attach file"}
                <input
                  id={inputId}
                  type="file"
                  className="hidden"
                  disabled={attaching}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) onAttachFile(line as number, file);
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSave} disabled={loading} className="rounded-sm bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
          Save Draft
        </button>
        <button type="button" onClick={onGeneratePdf} disabled={loading} className="rounded-sm bg-[#1f2a44] px-3 py-2 text-sm font-semibold text-white">
          Save & Generate Filing PDF
        </button>
        <button type="button" onClick={onMarkFiled} disabled={loading} className="rounded-sm bg-slate-700 px-3 py-2 text-sm font-semibold text-white">
          Mark Filed
        </button>
      </div>
    </div>
  );
}


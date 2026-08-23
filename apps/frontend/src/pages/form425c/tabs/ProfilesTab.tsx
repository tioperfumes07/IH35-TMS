import { Link } from "react-router-dom";
import { DatePicker } from "../../../components/forms/DatePicker";
import type { CompanyKey, CompanyProfiles } from "../types";
import { QUESTIONNAIRE } from "../lib/constants";

type Props = {
  profiles: CompanyProfiles;
  activeCompany: CompanyKey;
  availableCompanies: CompanyKey[];
  setActiveCompany: (company: CompanyKey) => void;
  onChange: (company: CompanyKey, updater: (draft: CompanyProfiles[CompanyKey]) => CompanyProfiles[CompanyKey]) => void;
  onSave: () => void;
  saving: boolean;
};

export function ProfilesTab({ profiles, activeCompany, availableCompanies, setActiveCompany, onChange, onSave, saving }: Props) {
  const profile = profiles[activeCompany];
  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2">
        {availableCompanies.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setActiveCompany(k)}
            className={`rounded-sm px-3 py-2 text-sm font-semibold ${activeCompany === k ? "bg-slate-800 text-white" : "bg-white text-slate-700 border"}`}
          >
            {profiles[k].name}
          </button>
        ))}
        <button type="button" onClick={onSave} disabled={saving} className="ml-auto rounded-sm bg-slate-600 px-3 py-2 text-sm font-semibold text-white">
          {saving ? "Saving..." : "Save Defaults"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
          Petition Date
          <div className="mt-1 font-normal normal-case">
            <DatePicker
              value={profile.petitionDate ?? ""}
              onChange={(value) => onChange(activeCompany, (draft) => ({ ...draft, petitionDate: value }))}
              className="w-full"
              data-testid="form425c-petition-date"
            />
          </div>
        </label>
        {[
          ["Company Name", "name"],
          ["Case Number", "caseNumber"],
          ["District", "district"],
          ["Division", "division"],
          ["Judge", "judge"],
          ["EIN", "ein"],
          ["Address", "address"],
          ["Line of Business", "lineOfBusiness"],
          ["NAICS", "naiscCode"],
        ].map(([label, key]) => (
          <label key={key} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            {label}
            <input
              className="mt-1 w-full rounded-sm border px-2 py-1.5 text-sm font-normal normal-case"
              value={String((profile as Record<string, unknown>)[key] ?? "")}
              onChange={(e) => onChange(activeCompany, (draft) => ({ ...draft, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      <div className="rounded-sm border bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Bank Accounts</div>
        <div className="space-y-2">
          {profile.bankAccounts.map((account, idx) => (
            <div key={`${account.id}-${idx}`} className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <input
                className="rounded-sm border px-2 py-1.5 text-sm"
                value={account.id}
                placeholder="Account code"
                onChange={(e) =>
                  onChange(activeCompany, (draft) => {
                    const next = [...draft.bankAccounts];
                    next[idx] = { ...next[idx], id: e.target.value };
                    return { ...draft, bankAccounts: next };
                  })
                }
              />
              <input
                className="rounded-sm border px-2 py-1.5 text-sm md:col-span-2"
                value={account.label}
                placeholder="Label"
                onChange={(e) =>
                  onChange(activeCompany, (draft) => {
                    const next = [...draft.bankAccounts];
                    next[idx] = { ...next[idx], label: e.target.value };
                    return { ...draft, bankAccounts: next };
                  })
                }
              />
              <input
                className="rounded-sm border px-2 py-1.5 text-sm"
                value={account.number}
                placeholder="Last digits"
                onChange={(e) =>
                  onChange(activeCompany, (draft) => {
                    const next = [...draft.bankAccounts];
                    next[idx] = { ...next[idx], number: e.target.value };
                    return { ...draft, bankAccounts: next };
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-sm border bg-white">
        <div className="border-b bg-[#1f2a44] px-3 py-2 text-sm font-semibold text-white">Default Questionnaire Answers</div>
        {QUESTIONNAIRE.map((q) => {
          const answer = profile.defaultAnswers[q.num] ?? (q.expectYes ? "yes" : "no");
          const flagged = (q.expectYes && answer === "no") || (!q.expectYes && answer === "yes");
          return (
            <div key={q.num} className={`grid grid-cols-[24px_1fr_auto] items-center gap-2 border-b px-3 py-2 text-sm ${flagged ? "bg-slate-100" : ""}`}>
              <span className="font-semibold text-slate-500">{q.num}.</span>
              <span className="flex items-center gap-2">
                {q.text}
                {flagged ? (
                  <Link
                    to="/425c/exhibits"
                    className="rounded-sm bg-[#1f2a44] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white hover:underline"
                  >
                    Exhibit required
                  </Link>
                ) : null}
              </span>
              <div className="flex gap-2">
                {(["yes", "no", "na"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-1 text-xs uppercase text-slate-600">
                    <input
                      type="radio"
                      checked={answer === v}
                      onChange={() =>
                        onChange(activeCompany, (draft) => ({
                          ...draft,
                          defaultAnswers: { ...draft.defaultAnswers, [q.num]: v },
                        }))
                      }
                    />
                    {v}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

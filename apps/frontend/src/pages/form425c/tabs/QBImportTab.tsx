import { useMemo, useState } from "react";
import { MONTHS, YEARS } from "../lib/constants";
import { parseQBText } from "../lib/parseQBText";
import type { CompanyKey, CompanyProfiles, QBParsedLine } from "../types";

type Props = {
  activeCompany: CompanyKey;
  setActiveCompany: (company: CompanyKey) => void;
  profiles: CompanyProfiles;
  onApplyTotal: (totalReceipts: number) => void;
};

export function QBImportTab({ activeCompany, setActiveCompany, profiles, onApplyTotal }: Props) {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<QBParsedLine[]>([]);
  const profile = profiles[activeCompany];

  const includedTotal = useMemo(() => parsed.filter((x) => x.include).reduce((sum, x) => sum + x.amt, 0), [parsed]);

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="text-xs font-semibold uppercase text-slate-600">
          Company
          <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm normal-case" value={activeCompany} onChange={(e) => setActiveCompany(e.target.value as CompanyKey)}>
            <option value="trucking">{profiles.trucking.name}</option>
            <option value="transportation">{profiles.transportation.name}</option>
          </select>
        </label>
        <label className="text-xs font-semibold uppercase text-slate-600">
          Month
          <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm normal-case" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase text-slate-600">
          Year
          <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm normal-case" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="self-end text-xs text-slate-500">{profile.bankAccounts.length} configured account(s)</div>
      </div>

      <textarea
        className="h-56 w-full rounded border bg-white p-3 font-mono text-xs"
        placeholder={`Date\tType\tDescription\tAccount\tAmount\n01/05/${year}\tDeposit\tCustomer Payment\t${profile.bankAccounts[0]?.id ?? "WF-3500"}\t12500.00`}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />

      <div className="flex gap-2">
        <button type="button" className="rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white" onClick={() => setParsed(parseQBText(raw, profile.bankAccounts))}>
          Parse Income Deposits
        </button>
        <button type="button" className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white" onClick={() => onApplyTotal(includedTotal)} disabled={!parsed.length}>
          Apply ${includedTotal.toFixed(2)} to Line 20
        </button>
      </div>

      {parsed.length ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-2 py-2 text-left">Use</th>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Type</th>
                <th className="px-2 py-2 text-left">Description</th>
                <th className="px-2 py-2 text-left">Account</th>
                <th className="px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {parsed.map((row, idx) => (
                <tr key={`${row.date}-${idx}`} className={row.include ? "border-b" : "border-b bg-red-50"}>
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={() =>
                        setParsed((prev) => prev.map((p, i) => (i === idx ? { ...p, include: !p.include } : p)))
                      }
                    />
                  </td>
                  <td className="px-2 py-1">{row.date}</td>
                  <td className="px-2 py-1">{row.type}</td>
                  <td className="px-2 py-1">{row.desc}</td>
                  <td className="px-2 py-1">{row.acct}</td>
                  <td className="px-2 py-1 text-right">${row.amt.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="text-xs text-slate-500">
        Session-scoped preview only. Authoritative Form lines 19-23 remain backend Banking import values (DIP real accounts only; virtual factoring/escrow excluded).
      </div>
    </div>
  );
}


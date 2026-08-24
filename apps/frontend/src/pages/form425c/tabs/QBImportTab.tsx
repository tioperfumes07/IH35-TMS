import { useMemo, useState } from "react";
import { formatDateUS } from "../../../lib/formatDate";
import { MONTHS, YEARS } from "../lib/constants";
import { parseQBText, qbDateInPeriod } from "../lib/parseQBText";
import type { CompanyKey, CompanyProfiles, QBParsedLine } from "../types";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";

type Props = {
  activeCompany: CompanyKey;
  setActiveCompany: (company: CompanyKey) => void;
  month: number;
  year: number;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  profiles: CompanyProfiles;
  onApplyTotal: (totalReceipts: number) => void;
};

/** Parsed line + its position in the parsed array so the include-toggle targets the right row after sort/page. */
type ParsedRow = QBParsedLine & { idx: number };

export function QBImportTab({
  activeCompany,
  setActiveCompany,
  month,
  year,
  setMonth,
  setYear,
  profiles,
  onApplyTotal,
}: Props) {
  const { pushToast } = useToast();
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<QBParsedLine[]>([]);
  const profile = profiles[activeCompany];

  function parseIncomeDeposits() {
    const text = raw.trim();
    if (!text) {
      setParsed([]);
      pushToast("Paste a tab-delimited deposit export first", "error");
      return;
    }
    const allRows = parseQBText(raw, profile.bankAccounts);
    const rows = allRows.filter((row) => qbDateInPeriod(row.date, month, year));
    setParsed(rows);
    if (allRows.length > 0 && rows.length === 0) {
      pushToast(
        `No DIP deposits in ${MONTHS[month]} ${year} — month/year filter excluded pasted rows`,
        "error",
      );
      return;
    }
    if (rows.length === 0) {
      pushToast(
        "No matching DIP deposits — check tab-separated columns and bank account codes on Profiles",
        "error",
      );
    }
  }

  const includedTotal = useMemo(() => parsed.filter((x) => x.include).reduce((sum, x) => sum + x.amt, 0), [parsed]);

  const parsedRows = useMemo<ParsedRow[]>(() => parsed.map((row, idx) => ({ ...row, idx })), [parsed]);

  // Excluded rows keep the original muted + line-through look; the span-level class is needed
  // because ParityTable's <td> sets its own text color that would otherwise win over the row class.
  const mutedClass = (row: ParsedRow) => (row.include ? "" : "text-slate-400 line-through");

  const columns = useMemo<Array<ParityColumn<ParsedRow>>>(
    () => [
      {
        key: "include",
        label: "Use",
        render: (row) => (
          <input
            type="checkbox"
            checked={row.include}
            onChange={() =>
              setParsed((prev) => prev.map((p, i) => (i === row.idx ? { ...p, include: !p.include } : p)))
            }
          />
        ),
      },
      { key: "date", label: "Date", sortable: true, render: (row) => <span className={mutedClass(row)}>{formatDateUS(row.date)}</span> },
      { key: "type", label: "Type", sortable: true, render: (row) => <span className={mutedClass(row)}>{row.type}</span> },
      { key: "desc", label: "Description", sortable: true, render: (row) => <span className={mutedClass(row)}>{row.desc}</span> },
      { key: "acct", label: "Account", sortable: true, render: (row) => <span className={mutedClass(row)}>{row.acct}</span> },
      {
        key: "amt",
        label: "Amount",
        sortable: true,
        className: "text-right",
        sortValue: (row) => row.amt,
        render: (row) => <span className={mutedClass(row)}>${row.amt.toFixed(2)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="text-xs font-semibold uppercase text-slate-600">
          Company
          <SelectCombobox className="mt-1 w-full rounded-sm border px-2 py-1.5 text-sm normal-case" value={activeCompany} onChange={(e) => setActiveCompany(e.target.value as CompanyKey)}>
            <option value="trucking">{profiles.trucking.name}</option>
            <option value="transportation">{profiles.transportation.name}</option>
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
        <div className="self-end text-xs text-slate-500">{profile.bankAccounts.length} configured account(s)</div>
      </div>

      <textarea
        className="h-56 w-full rounded-sm border bg-white p-3 font-mono text-xs"
        placeholder={`Date\tType\tDescription\tAccount\tAmount\n01/05/${year}\tDeposit\tCustomer Payment\t${profile.bankAccounts[0]?.id ?? "WF-3500"}\t12500.00`}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />

      <div className="flex gap-2">
        <button type="button" className="rounded-sm bg-slate-800 px-3 py-2 text-sm font-semibold text-white" onClick={parseIncomeDeposits}>
          Parse Income Deposits
        </button>
        <button
          type="button"
          className="rounded-sm bg-slate-600 px-3 py-2 text-sm font-semibold text-white"
          onClick={() => {
            if (!parsed.length) {
              pushToast("Parse Income Deposits before applying to Line 20", "error");
              return;
            }
            if (includedTotal <= 0) {
              pushToast("No included deposits — check Use boxes before applying to Line 20", "error");
              return;
            }
            onApplyTotal(includedTotal);
            pushToast(`Applied $${includedTotal.toFixed(2)} to Line 20`, "success");
          }}
        >
          Apply ${includedTotal.toFixed(2)} to Line 20
        </button>
      </div>

      {parsed.length ? (
        <ParityTable
          columns={columns}
          rows={parsedRows}
          rowKey={(row) => `${row.date}-${row.idx}`}
          storageKey="form425c-qb-import-preview"
          tableTestId="qb-import-preview-table"
          rowClassName={(row) => (row.include ? "" : "bg-slate-100")}
        />
      ) : null}
      <div className="text-xs text-slate-500">
        Session-scoped preview only. Authoritative Form lines 19-23 remain backend Banking import values (DIP real accounts only; virtual factoring/escrow excluded).
      </div>
    </div>
  );
}

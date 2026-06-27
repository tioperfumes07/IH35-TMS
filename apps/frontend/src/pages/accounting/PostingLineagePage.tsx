import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getAccountingSourceLineage, type AccountingSourceLineageRow } from "../../api/accounting";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ReportBlockVPendingBanner } from "../reports/ReportBlockVPendingBanner";

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function PostingLineagePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [submitted, setSubmitted] = useState<{ sourceType: string; sourceId: string } | null>(null);

  const lineageQuery = useMutation({
    mutationFn: (input: { sourceType: string; sourceId: string }) =>
      getAccountingSourceLineage(companyId, {
        source_transaction_type: input.sourceType,
        source_transaction_id: input.sourceId,
        limit: 500,
      }),
  });

  const totals = useMemo(() => {
    const rows = (lineageQuery.data?.rows ?? []) as AccountingSourceLineageRow[];
    let debit = 0;
    let credit = 0;
    for (const row of rows) {
      if (row.debit_or_credit === "debit") debit += row.amount_cents;
      else credit += row.amount_cents;
    }
    return { debit, credit, balanced: debit === credit };
  }, [lineageQuery.data?.rows]);

  return (
    <AccountingSubNavWrapper title="Posting Lineage" subtitle="Trace source transaction → posting rows → linked objects">

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {lineageQuery.isError ? <ReportBlockVPendingBanner error={lineageQuery.error} onRetry={() => void lineageQuery.reset()} /> : null}

      <form
        className="grid gap-3 rounded border border-slate-200 bg-white p-3 md:grid-cols-[220px_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const next = {
            sourceType: sourceType.trim().toLowerCase(),
            sourceId: sourceId.trim(),
          };
          if (!next.sourceType || !next.sourceId || !companyId) return;
          setSubmitted(next);
          lineageQuery.mutate(next);
        }}
      >
        <label className="text-xs text-slate-600">
          Source type
          <input
            className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            placeholder="invoice | bill | payment"
          />
        </label>
        <label className="text-xs text-slate-600">
          Source transaction id
          <input
            className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="source_transaction_id"
          />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" loading={lineageQuery.isPending} disabled={!companyId}>
            Load lineage
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSourceType("");
              setSourceId("");
              setSubmitted(null);
              lineageQuery.reset();
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      {submitted ? (
        <div className="rounded border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-800">
            Source: {submitted.sourceType} / {submitted.sourceId}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Debit {formatMoney(totals.debit)} · Credit {formatMoney(totals.credit)} ·{" "}
            <span className={totals.balanced ? "text-emerald-700" : "text-red-700"}>
              {totals.balanced ? "Balanced" : "Out of balance"}
            </span>
          </div>
        </div>
      ) : null}

      {lineageQuery.data?.rows && lineageQuery.data.rows.length > 0 ? (
        <div className="overflow-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2">Occurred</th>
                <th className="px-2 py-2">JE</th>
                <th className="px-2 py-2">Posting batch</th>
                <th className="px-2 py-2">Account</th>
                <th className="px-2 py-2">Side</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">Linked object</th>
              </tr>
            </thead>
            <tbody>
              {(lineageQuery.data.rows as AccountingSourceLineageRow[]).map((row) => (
                <tr key={`${row.posting_id}:${row.linked_object_id ?? "none"}`} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-2 py-2">{formatWhen(row.occurred_at)}</td>
                  <td className="px-2 py-2 font-mono">{row.journal_entry_id}</td>
                  <td className="px-2 py-2 font-mono">{row.posting_batch_id ?? "—"}</td>
                  <td className="px-2 py-2">
                    {row.account_number ?? "—"} {row.account_name ? `- ${row.account_name}` : ""}
                  </td>
                  <td className="px-2 py-2">{row.debit_or_credit.toUpperCase()}</td>
                  <td className="px-2 py-2">{formatMoney(row.amount_cents)}</td>
                  <td className="px-2 py-2">
                    {row.linked_object_type ?? "—"}
                    {row.linked_object_id ? ` / ${row.linked_object_id}` : ""}
                    {row.relationship_role ? ` (${row.relationship_role})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {lineageQuery.data?.rows && lineageQuery.data.rows.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-500">
          No posting lineage rows found for this source transaction.
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}

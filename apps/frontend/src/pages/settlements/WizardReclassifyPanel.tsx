// ROUND 363-CC2-D — Reclassify, reachable from inside the Settlement Creator, on the lines the owner just posted.
//
// Not a wizard-local copy of the logic: the lines come from findReclassifyLines (the Accounting > Reclassify register's
// own query, narrowed to these documents) and the change goes through applyReclassify — the one reclassify engine, the
// same writer and the same audit record as the Accounting tab. Guard: scripts/verify-wizard-and-reclassify-share-one-writer.mjs.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { applyReclassify, findReclassifyLines, type ReclassifyBatchResult } from "../../api/reclassify";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { Button } from "../../components/Button";
import { EntityLink } from "../../components/shared/EntityLink";
import { formatUsdCentsTable } from "../../lib/money";
import { formatDateQboList } from "../../lib/formatDate";
import { docTarget, notReclassifiable } from "../../lib/reclassifyDrill";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { useShowAccountNumbers } from "../../lib/useShowAccountNumbers";

export function WizardReclassifyPanel({
  companyId,
  documentIds,
  postedLabel,
  accountOptions,
  onDone,
}: {
  companyId: string;
  /** The documents the wizard just created (expenses, invoices). */
  documentIds: string[];
  postedLabel: string;
  accountOptions: Array<{ value: string; label: string }>;
  onDone: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  // Owner ruling (Round 83): account numbers hidden unless the viewer's toggle is on.
  const [showAccountNumbers] = useShowAccountNumbers();
  const linesQ = useQuery({
    queryKey: ["wizard-reclassify-lines", companyId, documentIds],
    queryFn: () => findReclassifyLines(companyId, { from_date: "2000-01-01", to_date: today, source_transaction_ids: documentIds, limit: 500 }),
    enabled: Boolean(companyId) && documentIds.length > 0,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toAccount, setToAccount] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReclassifyBatchResult | null>(null);

  const lines = useMemo(() => (linesQ.data?.lines ?? []).filter((l) => l.debit_or_credit === "debit"), [linesQ.data]);

  async function apply() {
    if (!toAccount || selected.size === 0 || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await applyReclassify({
        operating_company_id: companyId,
        posting_ids: [...selected],
        reason: reason.trim(),
        to_account_id: toAccount,
        filter_snapshot: { surface: "settlement_creator", document_ids: documentIds },
      });
      setResult(res);
      setSelected(new Set());
      await linesQ.refetch();
    } catch (e) {
      setError(String((e as Error).message || "Reclassify failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-[#E5E7EB] bg-white p-3 text-xs" data-testid="sc-reclassify-panel">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{postedLabel}</div>
          <div className="text-slate-600">
            Wrong account on a line you just entered? Select it and reclassify here — the same engine as Accounting › Reclassify.
          </div>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onDone} data-testid="sc-reclassify-done">
          Done
        </Button>
      </div>

      {linesQ.isLoading ? <div>Loading the posted lines…</div> : null}
      {linesQ.isError ? <div className="text-red-700">Could not read the posted lines: {String((linesQ.error as Error)?.message ?? "")}</div> : null}
      {!linesQ.isLoading && !linesQ.isError && lines.length === 0 ? (
        <div className="text-slate-600">No expense line posted to the general ledger yet (fuel posts when its card line is matched in Banking).</div>
      ) : null}

      {lines.length > 0 ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#E5E7EB] text-center">
              <th className="p-1" />
              <th className="p-1">Date</th>
              <th className="p-1">Document</th>
              <th className="p-1">Account</th>
              <th className="p-1">Memo</th>
              <th className="p-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const why = notReclassifiable(l);
              const target = docTarget(l);
              return (
                <tr key={l.posting_id} className="border-b border-[#E5E7EB]" title={why ?? undefined}>
                  <td className="p-1 text-center">
                    <input
                      type="checkbox"
                      disabled={Boolean(why)}
                      checked={selected.has(l.posting_id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(l.posting_id);
                        else next.delete(l.posting_id);
                        setSelected(next);
                      }}
                      aria-label={`Select ${l.document_number ?? l.posting_id}`}
                    />
                  </td>
                  <td className="p-1 text-center">{formatDateQboList(l.entry_date)}</td>
                  <td className="p-1 text-center">
                    <EntityLink kind={target.kind} id={target.id} label={l.document_number ?? "Open"} />
                  </td>
                  <td className="p-1">{formatAccountDisplayLabel({ account_name: l.account_name, account_number: l.account_number }, { showNumber: showAccountNumbers })}</td>
                  <td className="p-1">{l.description ?? "—"}</td>
                  <td className="p-1 text-right tabular-nums">{formatUsdCentsTable(l.amount_cents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {lines.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          <ReferenceSelect
            value={toAccount}
            onChange={(id) => setToAccount(id)}
            options={accountOptions}
            createKind="account"
            operatingCompanyId={companyId}
            placeholder="Move selected lines to account…"
            data-testid="sc-reclassify-to-account"
          />
          <input
            className="h-7 rounded-sm border border-[#E5E7EB] px-2 text-xs"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            aria-label="Reclassify reason"
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || !toAccount || selected.size === 0 || !reason.trim()}
            onClick={() => void apply()}
            data-testid="sc-reclassify-apply"
          >
            {busy ? "Reclassifying…" : `Reclassify ${selected.size || ""} line${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      ) : null}
      {error ? <div className="text-red-700">{error}</div> : null}
      {result ? <div className="font-semibold text-slate-700">Reclassified — batch {result.batch_id ?? ""}. Undo it from Accounting › Reclassify.</div> : null}
    </section>
  );
}

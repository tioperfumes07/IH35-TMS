import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBankTieout, getBankTieoutDrill } from "../../api/bankTieout";
import { formatDateTimeUS, formatDateUS } from "../../lib/formatDate";
import { formatUsdCentsTable } from "../../lib/money";
import { EntityLink } from "../shared/EntityLink";

/**
 * ROUND 313 BANK-TIEOUT-01 — the register header for a bank account: feed balance vs its GL account, the
 * difference, and how much of it is explained by bank lines not yet posted and GL lines no bank line matches.
 */
const STATUS_TEXT = { tied: "Ties to the GL", explained: "Difference fully explained", unexplained: "Unexplained difference", no_gl_account: "No GL account linked" } as const;

export function BankTieoutHeader({ companyId, bankAccountId }: { companyId: string; bankAccountId: string }) {
  const [drill, setDrill] = useState(false);
  const q = useQuery({ queryKey: ["banking", "tieout", companyId, bankAccountId], queryFn: () => getBankTieout(companyId, bankAccountId), enabled: Boolean(companyId && bankAccountId) });
  const d = useQuery({ queryKey: ["banking", "tieout-drill", companyId, bankAccountId], queryFn: () => getBankTieoutDrill(companyId, bankAccountId), enabled: drill });
  const t = q.data?.tieout;
  if (q.isError) return <p className="mb-2 text-xs text-gray-600">Bank tie-out could not be computed.</p>;
  if (!t) return null;
  const m = (c: number | null) => (c == null ? "—" : formatUsdCentsTable(c));
  return (
    <section className="mb-3 space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="bank-tieout-header">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-900">Bank tie-out · {STATUS_TEXT[t.status]}</span>
        <span className="text-xs text-gray-600">
          Feed synced {t.feed_synced_at ? formatDateTimeUS(t.feed_synced_at) : "never"}
          {t.explained_by?.stale_feed ? " — feed is stale, its balance may be behind" : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          ["Feed balance", m(t.feed_balance_cents)],
          ["GL balance", m(t.gl_balance_cents)],
          ["Difference", m(t.diff_cents)],
          [`Bank lines not posted (${t.feed_only_count})`, m(t.feed_only_cents)],
          [`GL lines unmatched (${t.gl_only_count})`, m(t.gl_only_cents)],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">{k}</div>
            <div className="text-xs font-semibold text-slate-900">{v}</div>
          </div>
        ))}
      </div>
      {t.status !== "no_gl_account" ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700">
          <span>Unexplained: <strong>{m(t.unexplained_cents)}</strong></span>
          <button type="button" className="underline" onClick={() => setDrill((x) => !x)}>{drill ? "Hide the difference" : "Show the difference line by line"}</button>
        </div>
      ) : null}
      {drill && d.data ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="bank-tieout-drill">
          <div>
            <div className="text-section-header font-bold uppercase text-[#4B5563]">Bank lines not posted to the GL</div>
            <ul className="mt-1 max-h-64 space-y-1 overflow-auto text-xs">
              {d.data.feed_only.map((r) => (
                <li key={r.bank_transaction_id}>
                  <EntityLink kind="bank_transaction" id={r.bank_transaction_id} label={`${formatDateUS(r.transaction_date)} ${r.description ?? ""}`} /> · {formatUsdCentsTable(r.signed_cents)}
                  {r.factoring_purchase_id ? (
                    <>
                      {" · "}
                      <EntityLink kind="factoring_purchase" id={String(r.factoring_purchase_id)} label="Faro wire" />
                    </>
                  ) : null}
                </li>
              ))}
              {d.data.feed_only.length === 0 ? <li className="text-gray-500">None</li> : null}
            </ul>
          </div>
          <div>
            <div className="text-section-header font-bold uppercase text-[#4B5563]">GL lines no bank line matches</div>
            <ul className="mt-1 max-h-64 space-y-1 overflow-auto text-xs">
              {d.data.gl_only.map((r, i) => (
                <li key={`${r.journal_entry_id}-${i}`}>
                  <EntityLink kind="journal_entry" id={r.journal_entry_id} label={`${formatDateUS(r.entry_date)} ${r.memo ?? "Journal entry"}`} /> · {formatUsdCentsTable(r.signed_cents)}
                </li>
              ))}
              {d.data.gl_only.length === 0 ? <li className="text-gray-500">None</li> : null}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

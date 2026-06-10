/**
 * vE — Transaction Linkage Map (read-only).
 * Shows how documents link: Invoice → Payment, Bill → Bill Payment, etc.
 * Non-financial: display/read only, no GL posting, no accounting.* writes.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText, DollarSign, CreditCard, ShoppingCart } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

type LinkageRow = {
  id: string;
  source_type: string;
  source_ref: string;
  source_id: string;
  target_type: string;
  target_ref: string;
  target_id: string;
  amount_cents: number;
  link_type: "payment" | "bill_payment" | "credit_memo" | "deposit" | "other";
  linked_at: string | null;
};

const DOC_ICON: Record<string, React.ReactNode> = {
  Invoice: <FileText className="h-3.5 w-3.5 text-sky-600" />,
  Payment: <DollarSign className="h-3.5 w-3.5 text-emerald-600" />,
  Bill: <ShoppingCart className="h-3.5 w-3.5 text-amber-600" />,
  "Bill Payment": <CreditCard className="h-3.5 w-3.5 text-violet-600" />,
  Expense: <CreditCard className="h-3.5 w-3.5 text-rose-600" />,
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function fmtMoney(cents: number) { return usd.format(cents / 100); }

const LINK_TYPE_LABEL: Record<LinkageRow["link_type"], string> = {
  payment: "Paid by",
  bill_payment: "Paid by",
  credit_memo: "Credited by",
  deposit: "Deposited",
  other: "Linked to",
};

type Density = "regular" | "compact" | "ultra";
const DENSITY_PAD: Record<Density, string> = { regular: "py-2", compact: "py-1", ultra: "py-0.5" };

export function TransactionLinkageMapPage() {
  const { selectedCompanyId } = useCompanyContext();
  const [density, setDensity] = useState<Density>("regular");
  const [search, setSearch] = useState("");
  const densityCycle: Record<Density, Density> = { regular: "compact", compact: "ultra", ultra: "regular" };

  const query = useQuery<LinkageRow[]>({
    queryKey: ["transaction-linkage", selectedCompanyId ?? ""],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const res = await fetch(`/api/v1/accounting/transaction-linkages?operating_company_id=${selectedCompanyId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(selectedCompanyId),
  });

  const rows = (query.data ?? []).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.source_ref.toLowerCase().includes(q) ||
      r.target_ref.toLowerCase().includes(q) ||
      r.source_type.toLowerCase().includes(q) ||
      r.target_type.toLowerCase().includes(q)
    );
  });

  const rowPad = DENSITY_PAD[density];

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-3">
      <PageHeader
        title="Transaction Linkage Map"
        subtitle="Read-only: how documents are linked (Invoice → Payment, Bill → Bill Payment, etc.)"
        actions={
          <div className="flex items-center gap-2">
            <input
              type="search"
              className="rounded border border-gray-300 px-2 py-1 text-sm w-44"
              placeholder="Search ref…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              title="Toggle density"
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              onClick={() => setDensity((d) => densityCycle[d])}
            >
              ⊞ {density.charAt(0).toUpperCase() + density.slice(1)}
            </button>
          </div>
        }
      />

      {!selectedCompanyId ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Select a company to view transaction links.
        </div>
      ) : query.isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Source document</th>
                <th className="px-3 py-2 text-left">Link type</th>
                <th className="px-3 py-2 text-left">Target document</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Linked</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                    {search ? "No matches." : "No transaction links found."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={`border-t border-gray-100 hover:bg-gray-50`}>
                    <td className={`px-3 ${rowPad}`}>
                      <div className="flex items-center gap-1.5">
                        {DOC_ICON[r.source_type] ?? <FileText className="h-3.5 w-3.5 text-gray-400" />}
                        <span className="text-xs text-gray-500">{r.source_type}</span>
                        <span className="font-mono text-xs font-medium">{r.source_ref}</span>
                      </div>
                    </td>
                    <td className={`px-3 ${rowPad}`}>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <ArrowRight className="h-3 w-3" />
                        <span>{LINK_TYPE_LABEL[r.link_type]}</span>
                      </div>
                    </td>
                    <td className={`px-3 ${rowPad}`}>
                      <div className="flex items-center gap-1.5">
                        {DOC_ICON[r.target_type] ?? <FileText className="h-3.5 w-3.5 text-gray-400" />}
                        <span className="text-xs text-gray-500">{r.target_type}</span>
                        <span className="font-mono text-xs font-medium">{r.target_ref}</span>
                      </div>
                    </td>
                    <td className={`px-3 ${rowPad} text-right font-mono text-xs`}>
                      {fmtMoney(r.amount_cents)}
                    </td>
                    <td className={`px-3 ${rowPad} text-xs text-gray-500`}>
                      {r.linked_at ? new Date(r.linked_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">
            {rows.length} link{rows.length !== 1 ? "s" : ""} · Read-only view
          </div>
        </div>
      )}
    </div>
  );
}

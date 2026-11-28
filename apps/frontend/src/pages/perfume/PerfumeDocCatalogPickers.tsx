/**
 * PERFUME M20 (LEAD ROUND L.32): on a quote, sales order or purchase order the terms, shipping method and sales-tax code are
 * picked from their catalogs (the engine's terms list with its days, Catalogs → shipping methods, ScentsX's tax codes) —
 * never typed. The due date the invoice / bill will carry is shown from the picked terms' days.
 */
import { useQuery } from "@tanstack/react-query";
import { getPerfumeDocCatalogs, type PerfumeDocPickPatch, type PerfumeDocPicks } from "../../api/perfume";

const ctl = "block h-[30px] w-full rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs";

/** Date + days, as YYYY-MM-DD (UTC arithmetic on a calendar date — no time zone drift). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DocCatalogPickers({ doc, docDate, withTax, onPatch, testId, dueAfter }: {
  doc: PerfumeDocPicks & { terms?: string | null }; docDate: string | null | undefined; withTax: boolean;
  /** When the due date counts from a later document (a PO's bill): "vendor bill date". */
  dueAfter?: string;
  onPatch: (b: PerfumeDocPickPatch) => void; testId: string;
}) {
  const q = useQuery({ queryKey: ["perfume", "doc-catalogs"], queryFn: getPerfumeDocCatalogs, staleTime: 5 * 60_000 });
  const cats = q.data;
  const days = doc.terms_days ?? cats?.terms.find((t) => t.id === doc.payment_terms_id)?.days ?? null;
  const legacy = !doc.payment_terms_id && doc.terms ? doc.terms : null;
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      <label className="min-w-[180px] flex-1 text-xs">Payment terms
        <select className={ctl} value={doc.payment_terms_id ?? ""} data-testid={`${testId}-terms`}
          onChange={(e) => onPatch({ payment_terms_id: e.target.value || null })}>
          <option value="">{legacy ? `— ${legacy} (typed, pick one) —` : "— Pick terms —"}</option>
          {(cats?.terms ?? []).map((t) => <option key={t.id} value={t.id}>{`${t.name} (${t.days} day${t.days === 1 ? "" : "s"})`}</option>)}
        </select>
        <span className="text-xs text-gray-600" data-testid={`${testId}-due`}>
          {days == null ? "No terms picked — due on the customer's / vendor's own terms."
            : dueAfter ? `Due ${days} days after the ${dueAfter}`
            : docDate ? `Due ${addDays(docDate, days)} (${days} days from ${docDate})` : `Due ${days} days after the invoice date`}
        </span>
      </label>
      <label className="min-w-[180px] flex-1 text-xs">Shipping method
        <select className={ctl} value={doc.shipping_method ?? ""} data-testid={`${testId}-ship`}
          onChange={(e) => onPatch({ shipping_method: e.target.value || null })}>
          <option value="">— Pick —</option>
          {(cats?.shipping_methods ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      {withTax ? (
        <label className="min-w-[180px] flex-1 text-xs">Sales tax
          <select className={ctl} value={doc.tax_code_id ?? ""} data-testid={`${testId}-tax`}
            onChange={(e) => onPatch({ tax_code_id: e.target.value || null })}>
            <option value="">— Pick —</option>
            {(cats?.tax_codes ?? []).map((t) => <option key={t.id} value={t.id}>{t.rate_pct != null ? `${t.name} · ${t.rate_pct}%` : t.name}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}

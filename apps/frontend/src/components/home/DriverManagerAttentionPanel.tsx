/**
 * GAP-69 — Driver Manager attention panel (sorted action list)
 */

import { useNavigate } from "react-router-dom";

export type DriverManagerAttentionItem = {
  item_id: string;
  source: string;
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  body: string;
  count: number;
  action_url: string;
  action_label: string;
};

type Props = {
  items: DriverManagerAttentionItem[];
  loading?: boolean;
  coolingDriverCount?: number;
};

const SEVERITY_STYLES: Record<DriverManagerAttentionItem["severity"], string> = {
  critical: "border-red-300 bg-red-50 text-red-900",
  error: "border-orange-300 bg-orange-50 text-orange-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

export function DriverManagerAttentionPanel({ items, loading, coolingDriverCount }: Props) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <section className="rounded border border-slate-200 bg-white p-3" aria-label="Driver manager attention">
        <div className="mb-2 h-4 w-48 animate-pulse rounded bg-slate-100" />
        <div className="space-y-2">
          <div className="h-16 animate-pulse rounded bg-slate-100" />
          <div className="h-16 animate-pulse rounded bg-slate-100" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded border border-slate-200 bg-white" aria-label="Driver manager attention">
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Needs Attention</h2>
        {coolingDriverCount && coolingDriverCount > 0 ? (
          <p className="mt-1 text-[10px] text-amber-700">
            {coolingDriverCount} driver{coolingDriverCount === 1 ? "" : "s"} with no activity for 14+ days — retention outreach recommended.
          </p>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No driver manager actions right now — fleet operations look current.</p>
        ) : (
          items.map((item) => (
            <article
              key={item.item_id}
              className={`rounded border px-3 py-2 ${SEVERITY_STYLES[item.severity]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="mt-0.5 text-xs opacity-90">{item.body}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase">
                  {item.severity}
                </span>
              </div>
              <button
                type="button"
                className="mt-2 text-xs font-semibold underline"
                onClick={() => navigate(item.action_url)}
              >
                {item.action_label}
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

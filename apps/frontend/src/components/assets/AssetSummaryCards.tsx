import type { AssetSummary } from "./types";

type Props = {
  summary: AssetSummary;
};

const CARD_META: Array<{ key: keyof AssetSummary; label: string; tone: string }> = [
  { key: "total_assets", label: "Total assets", tone: "border-slate-300" },
  { key: "active_assets", label: "Active", tone: "border-emerald-400" },
  { key: "maintenance_assets", label: "Maintenance", tone: "border-amber-400" },
  { key: "out_of_service_assets", label: "Out of service", tone: "border-red-400" },
];

export function AssetSummaryCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {CARD_META.map((card) => (
        <article key={card.key} className={`rounded border border-gray-200 bg-white px-3 py-2 ${card.tone} border-l-4`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
          <p className="text-lg font-semibold text-gray-900">{summary[card.key]}</p>
        </article>
      ))}
    </div>
  );
}

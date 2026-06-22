import type { ComplianceSeverity } from "../../api/compliance";

type Summary = { red: number; yellow: number; green: number; total: number };

type Props = {
  summary: Summary;
  activeSeverity: ComplianceSeverity | null;
  onSelect: (severity: ComplianceSeverity | null) => void;
};

export function SummaryCards({ summary, activeSeverity, onSelect }: Props) {
  const cards: Array<{ key: ComplianceSeverity; label: string; count: number; className: string }> = [
    { key: "red", label: "Critical / Expired", count: summary.red, className: "border-red-500 bg-red-50" },
    { key: "yellow", label: "Due 7–30 days", count: summary.yellow, className: "border-amber-500 bg-amber-50" },
    { key: "green", label: "OK (>30 days)", count: summary.green, className: "border-green-600 bg-green-50" },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3" data-testid="compliance-summary-cards">
      {cards.map((card) => (
        <button
          key={card.key}
          type="button"
          className={`rounded-lg border-2 p-4 text-left ${card.className} ${activeSeverity === card.key ? "ring-2 ring-slate-400" : ""}`}
          onClick={() => onSelect(activeSeverity === card.key ? null : card.key)}
        >
          <div className="text-3xl font-semibold">{card.count}</div>
          <div className="text-sm font-medium">{card.label}</div>
        </button>
      ))}
    </div>
  );
}

/**
 * ROUND 443.293-C — the Bills first-tab tile (label, figure, sub) for the other
 * Accounting lists. The figure is the list's own aggregate. On a failed fetch the
 * caller passes "—", never a fabricated $0.00.
 */
import type { ReactNode } from "react";

export type AccountingBoardKpiTile = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "warn" | "danger";
};

function toneClass(tone: AccountingBoardKpiTile["tone"]): string {
  if (tone === "danger") return "border-l-4 border-l-red-500";
  if (tone === "warn") return "border-l-4 border-l-[#6B7280]";
  return "border-l-4 border-l-[#E5E7EB]";
}

export function AccountingBoardKpiStrip({
  testId,
  tiles,
}: {
  testId: string;
  tiles: readonly AccountingBoardKpiTile[];
}) {
  return (
    <div
      className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"
      data-testid={testId}
      data-accounting-board-kpis="1"
    >
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={`rounded-sm border border-gray-200 bg-white px-3 py-2 ${toneClass(tile.tone)}`}
        >
          <p className="text-section-header font-semibold uppercase tracking-wide text-gray-500">{tile.label}</p>
          <p className="text-page-title font-semibold text-gray-900">{tile.value}</p>
          {tile.sub != null ? <p className="text-xs text-gray-500">{tile.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}

import { BoardSection } from "../../../components/v3/BoardSection";

type Props = {
  preClause: number;
  postClause: number;
  target?: number;
  onOpenTimeline: () => void;
};

export function EscrowVisualizer({ preClause, postClause, target = 1000, onOpenTimeline }: Props) {
  const total = preClause + postClause;
  const pct = Math.max(0, Math.min(100, (total / target) * 100));
  return (
    <BoardSection
      title="Escrow"
      testId="settlement-statement-escrow-visualizer"
      headerRight={<span className="text-xs text-gray-700">{pct.toFixed(0)}%</span>}
    >
      <div className="space-y-2 px-3.5 py-2 text-xs">
        <div className="h-2 w-full rounded-sm bg-gray-200">
          <div className="h-2 rounded-sm bg-[#4B5563]" style={{ width: `${pct}%` }} />
        </div>
        <div className="space-y-1">
          <div>Pre-Clause: ${preClause.toFixed(2)}</div>
          <div>Post-Clause: ${postClause.toFixed(2)}</div>
          <div>
            Forfeiture Clause: <span className="rounded-sm bg-[#F7F8FA] px-1 py-0.5 text-[#1F2A44]">Active ✓</span>
          </div>
        </div>
        <button type="button" className="text-[#1F2A44] underline" onClick={onOpenTimeline}>
          Escrow timeline →
        </button>
      </div>
    </BoardSection>
  );
}

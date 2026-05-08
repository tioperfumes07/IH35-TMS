import type { SettlementStatus } from "../api/earnings";

const STAGES = ["delivered", "invoiced", "factored", "paid"] as const;
type Stage = (typeof STAGES)[number];

function completedStages(status: SettlementStatus): Stage[] {
  switch (status) {
    case "paid":
      return [...STAGES];
    case "locked":
      return ["delivered", "invoiced", "factored"];
    case "acked":
      return ["delivered", "invoiced"];
    case "presettle":
    case "draft":
      return ["delivered"];
    default:
      return [];
  }
}

export function TrueStatusChips({
  status,
  labels,
}: {
  status: SettlementStatus;
  labels: Record<Stage, string>;
}) {
  const reached = new Set(completedStages(status));
  return (
    <div className="flex flex-wrap gap-1">
      {STAGES.map((stage) => {
        const isReached = reached.has(stage);
        const classes = isReached
          ? "border-[#14532d] bg-[#14532d] text-[#4ade80]"
          : "border-[#404756] bg-[#404756] text-[#94a3b8]";
        return (
          <span key={stage} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${classes}`}>
            {isReached ? "✓ " : ""}
            {labels[stage]}
          </span>
        );
      })}
    </div>
  );
}

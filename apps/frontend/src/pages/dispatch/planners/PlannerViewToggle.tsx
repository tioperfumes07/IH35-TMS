/**
 * PlannerViewToggle — Grid / List segmented control.
 * ROUND 9.4 Board 12 — identical to docs/design/v3/Dispatch-TruckPlanner.dc.html:
 * outer 6px shell, inner 4px pads, active #13233F / 600 11px Inter.
 */
export type PlannerViewMode = "grid" | "list";

type PlannerViewToggleProps = {
  viewMode: PlannerViewMode;
  onChange: (mode: PlannerViewMode) => void;
};

const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

export function PlannerViewToggle({ viewMode, onChange }: PlannerViewToggleProps) {
  return (
    <span
      data-testid="planner-view-toggle"
      role="group"
      aria-label="Planner view mode"
      style={{
        display: "inline-flex",
        background: "#fff",
        border: "1px solid #DDE1E7",
        borderRadius: 6,
        padding: 2,
        gap: 2,
      }}
    >
      {([
        ["grid", "Grid"],
        ["list", "List"],
      ] as const).map(([id, label]) => {
        const on = viewMode === id;
        return (
          <button
            key={id}
            type="button"
            data-testid={`planner-view-${id}`}
            aria-pressed={on}
            onClick={() => onChange(id)}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              font: `600 11px ${FONT}`,
              background: on ? "#13233F" : "transparent",
              color: on ? "#fff" : "#5B6576",
              border: "none",
              cursor: "pointer",
              lineHeight: "normal",
            }}
          >
            {label}
          </button>
        );
      })}
    </span>
  );
}

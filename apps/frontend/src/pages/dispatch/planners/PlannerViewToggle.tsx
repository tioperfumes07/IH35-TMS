/**
 * PlannerViewToggle — shared [Grid] [List] button group for the planner pages.
 *
 * Each planner page (Driver/Truck/Loads/Timeline) renders a grid/calendar view by
 * default and offers a ParityTable list view with sortable columns, pagination,
 * CSV export, and Print. This toggle switches between them.
 */
export type PlannerViewMode = "grid" | "list";

type PlannerViewToggleProps = {
  viewMode: PlannerViewMode;
  onChange: (mode: PlannerViewMode) => void;
};

export function PlannerViewToggle({ viewMode, onChange }: PlannerViewToggleProps) {
  const base =
    "flex h-7 items-center rounded-sm px-3 text-xs font-medium transition-colors";
  return (
    <div
      data-testid="planner-view-toggle"
      className="flex items-center gap-1 rounded-sm border border-gray-200 bg-white p-1"
      role="group"
      aria-label="Planner view mode"
    >
      <button
        type="button"
        data-testid="planner-view-grid"
        aria-pressed={viewMode === "grid"}
        onClick={() => onChange("grid")}
        className={`${base} ${
          viewMode === "grid"
            ? "bg-[var(--planner-active)] text-white"
            : "text-gray-700 hover:bg-gray-100"
        }`}
      >
        Grid
      </button>
      <button
        type="button"
        data-testid="planner-view-list"
        aria-pressed={viewMode === "list"}
        onClick={() => onChange("list")}
        className={`${base} ${
          viewMode === "list"
            ? "bg-[var(--planner-active)] text-white"
            : "text-gray-700 hover:bg-gray-100"
        }`}
      >
        List
      </button>
    </div>
  );
}

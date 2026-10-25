import type { ReactNode } from "react";
import { Breadcrumb } from "../../components/shared/Breadcrumb";

type TabItem = { label: string; to: string };

/**
 * ROUND 443.326 — Vendors list chrome matching FuelPlannerBoardChrome grammar:
 * breadcrumb + title + state tab strip. Replaces legacy module header + navy tab strip extract theater.
 * Tabs stay state-driven (listTab / onListTabChange) — they are not route leaves.
 */
export function VendorsBoardChrome({
  title,
  subtitle,
  actions,
  listTab,
  onListTabChange,
  tabItems,
  tabIds,
  afterHeader,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  listTab: string;
  onListTabChange: (id: string) => void;
  tabItems: TabItem[];
  tabIds: string[];
  afterHeader?: ReactNode;
}) {
  return (
    <div className="space-y-3" data-vendors-board-chrome="1" data-testid="vendors-board-chrome">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div data-testid="vendors-breadcrumb">
            <Breadcrumb items={[{ label: "Vendors" }]} />
          </div>
          <h1 className="text-page-title font-semibold text-gray-900">{title}</h1>
          {subtitle ? <p className="text-xs text-gray-600">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2" data-vendors-toolbar="true">
          {actions}
        </div>
      </div>
      {afterHeader}
      <div
        className="flex flex-wrap gap-1"
        data-c31-list-default="vendors"
        data-testid="vendors-list-tabs"
        role="tablist"
      >
        {tabItems.map((item, i) => {
          const id = tabIds[i] ?? item.to.replace(/^#/, "");
          const active = listTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`vendors-list-tab-${id}`}
              onClick={() => onListTabChange(id)}
              className={`inline-flex h-7 items-center rounded-sm border px-2 text-xs font-medium ${
                active
                  ? "border-[#14314F] bg-[#14314F] text-white"
                  : "border-[#E5E7EB] bg-[var(--surface-unselected)] text-[#1F2A44] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

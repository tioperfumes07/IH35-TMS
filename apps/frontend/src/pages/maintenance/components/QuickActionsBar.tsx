import { ActionButton } from "../../../components/shared/ActionButton";
import { SecondaryNavTabs } from "../../../components/shared/SecondaryNavTabs";
import type { WorkOrderType } from "../../../api/maintenance";
import { useState } from "react";

type QuickTabId = "wo_list" | "fleet_table" | "rm_status" | "service_location" | "open_damage";

type Props = {
  onCreate: (type: WorkOrderType) => void;
  quickTab: QuickTabId;
  onQuickTabChange: (tab: QuickTabId) => void;
};

export function QuickActionsBar({ onCreate, quickTab, onQuickTabChange }: Props) {
  const types: Array<{ id: WorkOrderType; label: string; danger?: boolean }> = [
    { id: "pm", label: "PM" },
    { id: "repair", label: "Repair" },
    { id: "tire", label: "Tire" },
    { id: "accident", label: "Accident", danger: true },
  ];
  const [menuOpen, setMenuOpen] = useState(false);

  const quickTabs = [
    { id: "wo_list", label: "WO List" },
    { id: "fleet_table", label: "Fleet Table" },
    { id: "rm_status", label: "R&M Status" },
    { id: "service_location", label: "Service / Location" },
    { id: "open_damage", label: "Open Damage" },
  ] as const;

  return (
    <div className="space-y-2 border-b border-gray-200 bg-white px-2 py-2">
      <div className="relative inline-block">
        <ActionButton
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          + Create WO
        </ActionButton>
        {menuOpen ? (
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[170px] rounded border border-gray-200 bg-white p-1 shadow-md">
            {types.map((type) => (
              <button
                key={type.id}
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  onCreate(type.id);
                  setMenuOpen(false);
                }}
              >
                {type.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <SecondaryNavTabs
        tabs={quickTabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        activeId={quickTab}
        onChange={(next) => onQuickTabChange(next as QuickTabId)}
      />
    </div>
  );
}

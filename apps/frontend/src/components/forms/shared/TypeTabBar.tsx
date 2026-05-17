type TabOption = {
  id: string;
  label: string;
};

export const BILL_TYPE_TABS: TabOption[] = [
  { id: "repair", label: "Repair Bill" },
  { id: "fuel", label: "Fuel Bill" },
  { id: "maintenance", label: "Maintenance Bill" },
  { id: "driver", label: "Driver Bill" },
  { id: "vendor", label: "Vendor Bill" },
  { id: "multiple", label: "Multiple Bills" },
];

export const EXPENSE_TYPE_TABS: TabOption[] = [
  { id: "roadside", label: "Roadside Expense" },
  { id: "fuel", label: "Fuel Expense" },
  { id: "tolls", label: "Tolls Expense" },
  { id: "lumper", label: "Lumper Expense" },
  { id: "other", label: "Other Expense" },
];

type Props = {
  tabs: TabOption[];
  activeId: string;
  onChange: (tabId: string) => void;
};

export function TypeTabBar({ tabs, activeId, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-gray-200">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const isAccidentWorkOrder = tab.id === "accident" && tab.label.toLowerCase() === "accident";
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`type-tab px-[14px] py-[9px] text-xs font-semibold ${active ? "active" : ""}`}
            style={{
              color: isAccidentWorkOrder ? (active ? "#b91c1c" : "#ef4444") : active ? "#1f2a44" : "#94a3b8",
              borderBottom: active ? `2px solid ${isAccidentWorkOrder ? "#b91c1c" : "#1f2a44"}` : "2px solid transparent",
              background: "transparent",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

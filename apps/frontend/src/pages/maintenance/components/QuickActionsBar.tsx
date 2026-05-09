import { ActionButton } from "../../../components/shared/ActionButton";
import type { WorkOrderType } from "../../../api/maintenance";
import { useState } from "react";

type Props = {
  onCreate: (type: WorkOrderType) => void;
};

export function QuickActionsBar({ onCreate }: Props) {
  const types: Array<{ id: WorkOrderType; label: string; danger?: boolean }> = [
    { id: "pm", label: "PM" },
    { id: "repair", label: "Repair" },
    { id: "tire", label: "Tire" },
    { id: "accident", label: "Accident", danger: true },
  ];
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <ActionButton
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        + Create Work Order
      </ActionButton>
      {menuOpen ? (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[170px] rounded border border-gray-200 bg-white p-1 shadow-md">
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
  );
}

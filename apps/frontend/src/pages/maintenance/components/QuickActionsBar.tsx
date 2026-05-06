import { Button } from "../../../components/Button";
import type { WorkOrderType } from "../../../api/maintenance";

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
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white px-2 py-2">
      <span className="text-xs font-semibold text-gray-600">+ Create WO:</span>
      {types.map((type) => (
        <Button key={type.id} type="button" size="sm" variant={type.danger ? "danger" : "secondary"} onClick={() => onCreate(type.id)}>
          {type.label}
        </Button>
      ))}
      <Button type="button" size="sm" variant="secondary">WO List</Button>
      <Button type="button" size="sm" variant="secondary">Fleet Table</Button>
      <Button type="button" size="sm" variant="secondary">R&M Status</Button>
      <Button type="button" size="sm" variant="secondary">Service / Location</Button>
      <Button type="button" size="sm" variant="secondary">Open Damage</Button>
    </div>
  );
}

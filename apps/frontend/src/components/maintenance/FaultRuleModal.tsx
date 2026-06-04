import { useEffect, useState } from "react";
import { Button } from "../Button";
import { Modal } from "../Modal";

export type FaultRuleFormValues = {
  id?: string;
  fault_code: string;
  source: "samsara" | "j1939_dtc" | "custom";
  description?: string;
  severity: "low" | "medium" | "high" | "critical";
  auto_create_wo: boolean;
  suggested_priority?: "routine" | "urgent" | "immediate" | null;
  estimated_repair_hours?: number | null;
};

type Props = {
  initial?: (FaultRuleFormValues & { id: string }) | null;
  onClose: () => void;
  onSave: (values: FaultRuleFormValues & { id?: string }) => void;
  saving?: boolean;
};

const empty: FaultRuleFormValues = {
  fault_code: "",
  source: "samsara",
  description: "",
  severity: "medium",
  auto_create_wo: false,
  suggested_priority: "routine",
  estimated_repair_hours: null,
};

export function FaultRuleModal({ initial, onClose, onSave, saving }: Props) {
  const [form, setForm] = useState<FaultRuleFormValues>(initial ?? empty);
  // ARCHIVE-not-DELETE (B25): prior create title "Add fault rule" — Sunset: 2026-09.
  const title = initial?.id ? "Edit fault rule" : "Create Rule";

  useEffect(() => {
    setForm(initial ?? empty);
  }, [initial]);

  return (
    <Modal open title={title} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-gray-600">Fault code</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={form.fault_code}
            onChange={(e) => setForm((f) => ({ ...f, fault_code: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-gray-600">Source</span>
          <select
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={form.source}
            onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as FaultRuleFormValues["source"] }))}
          >
            <option value="samsara">Samsara</option>
            <option value="j1939_dtc">J1939 DTC</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="block">
          <span className="text-gray-600">Description</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-gray-600">Severity</span>
          <select
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={form.severity}
            onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as FaultRuleFormValues["severity"] }))}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.auto_create_wo}
            onChange={(e) => setForm((f) => ({ ...f, auto_create_wo: e.target.checked }))}
          />
          Auto-create draft WO (high/critical only)
        </label>
        <label className="block">
          <span className="text-gray-600">Suggested priority</span>
          <select
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={form.suggested_priority ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                suggested_priority: (e.target.value || null) as FaultRuleFormValues["suggested_priority"],
              }))
            }
          >
            <option value="">—</option>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="immediate">Immediate</option>
          </select>
        </label>
        <label className="block">
          <span className="text-gray-600">Estimated repair hours</span>
          <input
            type="number"
            min={0}
            step={0.5}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={form.estimated_repair_hours ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                estimated_repair_hours: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={saving || !form.fault_code.trim()}
            onClick={() => onSave({ ...form, id: initial?.id })}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

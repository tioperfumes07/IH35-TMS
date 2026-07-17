import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createHosViolation } from "../../../api/safetyV64";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Source = "samsara_auto" | "manual_office" | "dot_citation";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

function defaultOccurredAtIso(): string {
  return new Date().toISOString();
}

/** datetime-local value (local wall clock) ↔ ISO with offset for z.string().datetime({ offset: true }). */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return defaultOccurredAtIso();
  return d.toISOString();
}

export function HosViolationCreateModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    driver_id: "",
    violation_type: "",
    occurred_at: defaultOccurredAtIso(),
    duration_minutes: "",
    source: "manual_office" as Source,
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      createHosViolation(operatingCompanyId, {
        driver_id: form.driver_id.trim(),
        violation_type: form.violation_type.trim(),
        occurred_at: form.occurred_at.includes("T")
          ? new Date(form.occurred_at).toISOString()
          : form.occurred_at,
        duration_minutes: form.duration_minutes.trim()
          ? Number(form.duration_minutes)
          : null,
        source: form.source,
        notes: form.notes.trim() || null,
      }),
    onSuccess: () => {
      setForm({
        driver_id: "",
        violation_type: "",
        occurred_at: defaultOccurredAtIso(),
        duration_minutes: "",
        source: "manual_office",
        notes: "",
      });
      onCreated();
      onClose();
    },
  });

  const canSubmit =
    Boolean(form.driver_id.trim() && form.violation_type.trim() && form.occurred_at) && !mutation.isPending;

  return (
    <Modal open={open} onClose={onClose} title="Create HOS Violation">
      <form
        className="space-y-3"
        data-testid="hos-violation-create-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          mutation.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-driver-id">
              Driver ID <span className="text-red-600">*</span>
            </label>
            <input
              id="hos-vio-driver-id"
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              placeholder="driver UUID"
              value={form.driver_id}
              onChange={(e) => setForm((v) => ({ ...v, driver_id: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-type">
              Violation type <span className="text-red-600">*</span>
            </label>
            <input
              id="hos-vio-type"
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              placeholder="e.g. 11_HOUR"
              value={form.violation_type}
              onChange={(e) => setForm((v) => ({ ...v, violation_type: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-occurred">
              Occurred at <span className="text-red-600">*</span>
            </label>
            <input
              id="hos-vio-occurred"
              type="datetime-local"
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={toDatetimeLocalValue(form.occurred_at)}
              onChange={(e) => setForm((v) => ({ ...v, occurred_at: fromDatetimeLocalValue(e.target.value) }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-source">
              Source
            </label>
            <SelectCombobox
              id="hos-vio-source"
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={form.source}
              onChange={(e) => setForm((v) => ({ ...v, source: e.target.value as Source }))}
            >
              <option value="manual_office">manual_office</option>
              <option value="samsara_auto">samsara_auto</option>
              <option value="dot_citation">dot_citation</option>
            </SelectCombobox>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-duration">
              Duration (minutes)
            </label>
            <input
              id="hos-vio-duration"
              type="number"
              min={0}
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={form.duration_minutes}
              onChange={(e) => setForm((v) => ({ ...v, duration_minutes: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-notes">
              Notes
            </label>
            <textarea
              id="hos-vio-notes"
              rows={2}
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={form.notes}
              onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
            />
          </div>
        </div>
        {mutation.isError ? (
          <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-900" role="alert">
            {mutation.error instanceof Error ? mutation.error.message : "Create failed. Please try again."}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!canSubmit}>
            + Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createHosViolation } from "../../../api/safetyV64";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { companyNow } from "../../../lib/businessDate";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

export function HosViolationCreateModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    driver_id: "",
    violation_code: "",
    violation_description: "",
    occurred_at: companyNow(),
    source: "manual" as "manual" | "eld_import" | "dot_inspection",
    duty_status: "",
    severity: "medium" as "low" | "medium" | "high" | "critical",
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      createHosViolation(operatingCompanyId, {
        driver_id: form.driver_id.trim(),
        violation_code: form.violation_code.trim(),
        violation_description: form.violation_description.trim() || undefined,
        occurred_at: form.occurred_at,
        source: form.source,
        duty_status: form.duty_status.trim() || undefined,
        severity: form.severity,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      setForm((prev) => ({
        ...prev,
        driver_id: "",
        violation_code: "",
        violation_description: "",
        notes: "",
        duty_status: "",
        occurred_at: companyNow(),
      }));
      onCreated();
      onClose();
    },
  });

  const canSubmit = Boolean(form.driver_id.trim() && form.violation_code.trim()) && !mutation.isPending;

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
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-code">
              Violation type <span className="text-red-600">*</span>
            </label>
            <input
              id="hos-vio-code"
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              placeholder="e.g. 11_HOUR"
              value={form.violation_code}
              onChange={(e) => setForm((v) => ({ ...v, violation_code: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-desc">
              Description
            </label>
            <input
              id="hos-vio-desc"
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={form.violation_description}
              onChange={(e) => setForm((v) => ({ ...v, violation_description: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-occurred">
              Occurred at
            </label>
            <input
              id="hos-vio-occurred"
              type="datetime-local"
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={form.occurred_at.slice(0, 16)}
              onChange={(e) => setForm((v) => ({ ...v, occurred_at: new Date(e.target.value).toISOString() }))}
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
              onChange={(e) => setForm((v) => ({ ...v, source: e.target.value as typeof form.source }))}
            >
              <option value="manual">manual_office</option>
              <option value="eld_import">samsara_auto</option>
              <option value="dot_inspection">dot_citation</option>
            </SelectCombobox>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-duty">
              Duration / duty status
            </label>
            <input
              id="hos-vio-duty"
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={form.duty_status}
              onChange={(e) => setForm((v) => ({ ...v, duty_status: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-severity">
              Severity
            </label>
            <SelectCombobox
              id="hos-vio-severity"
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={form.severity}
              onChange={(e) => setForm((v) => ({ ...v, severity: e.target.value as typeof form.severity }))}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </SelectCombobox>
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

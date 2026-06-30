import { useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useMutation } from "@tanstack/react-query";
import { createCompanyViolation } from "../../../api/safety";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { companyToday } from "../../../lib/businessDate";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

export function CompanyViolationCreateModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [violationType, setViolationType] = useState("DOT_inspection");
  const [severity, setSeverity] = useState("minor");
  const [reportedDate, setReportedDate] = useState(companyToday());
  const [description, setDescription] = useState("");
  const [correctivePlan, setCorrectivePlan] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createCompanyViolation(operatingCompanyId, {
        violation_type: violationType,
        violation_severity: severity,
        reported_date: reportedDate,
        description,
        corrective_action_plan: correctivePlan || null,
      }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Create Company Violation">
      <form
        className="space-y-3"
        data-testid="company-violation-create-modal"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Violation type</label>
            <SelectCombobox
              value={violationType}
              onChange={(event) => setViolationType(event.target.value)}
              className="rounded border border-gray-300 h-9 px-2 text-[13px]"
            >
              <option value="FMCSA_audit">FMCSA audit</option>
              <option value="DOT_inspection">DOT inspection</option>
              <option value="CSA_intervention">CSA intervention</option>
              <option value="state_audit">State audit</option>
              <option value="IRP">IRP</option>
              <option value="IFTA">IFTA</option>
              <option value="other">Other</option>
            </SelectCombobox>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Severity</label>
            <SelectCombobox
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="rounded border border-gray-300 h-9 px-2 text-[13px]"
            >
              <option value="warning">Warning</option>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="severe">Severe</option>
              <option value="OOS">OOS</option>
            </SelectCombobox>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Reported date</label>
            <DatePicker
              value={reportedDate}
              onChange={(next) => setReportedDate(next)}
              className="rounded border border-gray-300 px-2 text-sm py-2"
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              rows={3}
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Corrective action plan</label>
            <textarea
              value={correctivePlan}
              onChange={(event) => setCorrectivePlan(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              rows={2}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Save violation
          </Button>
        </div>
      </form>
    </Modal>
  );
}

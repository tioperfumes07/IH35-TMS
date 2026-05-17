import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createSafetyFine } from "../../../api/safety";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

export function FineCreateModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [subjectType, setSubjectType] = useState<"driver" | "company">("driver");
  const [subjectDriverId, setSubjectDriverId] = useState("");
  const [issuedByAuthority, setIssuedByAuthority] = useState("DOT");
  const [jurisdiction, setJurisdiction] = useState("");
  const [violationDescription, setViolationDescription] = useState("");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountUsd, setAmountUsd] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      createSafetyFine(operatingCompanyId, {
        subject_type: subjectType,
        subject_driver_id: subjectType === "driver" ? subjectDriverId || null : null,
        issued_by_authority: issuedByAuthority,
        jurisdiction: jurisdiction || null,
        violation_description: violationDescription,
        issued_date: issuedDate,
        amount_cents: Math.round(Number(amountUsd || 0) * 100),
        notes: notes || null,
      }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Create Fine">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Subject type</label>
            <SelectCombobox
              value={subjectType}
              onChange={(event) => setSubjectType(event.target.value as "driver" | "company")}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="driver">Driver</option>
              <option value="company">Company</option>
            </SelectCombobox>
          </div>
          {subjectType === "driver" ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Driver ID</label>
              <input
                value={subjectDriverId}
                onChange={(event) => setSubjectDriverId(event.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
                placeholder="UUID"
                required
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Issued by authority</label>
            <input
              value={issuedByAuthority}
              onChange={(event) => setIssuedByAuthority(event.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Jurisdiction</label>
            <input
              value={jurisdiction}
              onChange={(event) => setJurisdiction(event.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">Violation description</label>
            <input
              value={violationDescription}
              onChange={(event) => setViolationDescription(event.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Issued date</label>
            <input
              type="date"
              value={issuedDate}
              onChange={(event) => setIssuedDate(event.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Amount USD</label>
            <input
              type="number"
              step="0.01"
              value={amountUsd}
              onChange={(event) => setAmountUsd(event.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
              required
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">Notes</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
              rows={2}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Save fine
          </Button>
        </div>
      </form>
    </Modal>
  );
}

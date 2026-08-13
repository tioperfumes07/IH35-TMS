import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createFactor } from "../../api/factoring";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

type ReserveDashboardAddFactorModalProps = {
  companyId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (factorId: string) => void;
};

export function ReserveDashboardAddFactorModal({
  companyId,
  open,
  onClose,
  onCreated,
}: ReserveDashboardAddFactorModalProps) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [addForm, setAddForm] = useState({
    name: "",
    advance_rate: "0.95",
    fee_rate: "0.025",
    reserve_rate: "0.10",
    recourse_days: "90",
  });

  const addFactorMutation = useMutation({
    mutationFn: async () =>
      createFactor(companyId, {
        name: addForm.name.trim(),
        advance_rate: Number(addForm.advance_rate),
        fee_rate: Number(addForm.fee_rate),
        reserve_rate: Number(addForm.reserve_rate),
        recourse_days: Number(addForm.recourse_days),
      }),
    onSuccess: async (created) => {
      onClose();
      setAddForm({ name: "", advance_rate: "0.95", fee_rate: "0.025", reserve_rate: "0.10", recourse_days: "90" });
      if (created?.id) onCreated(created.id);
      pushToast("Factor created", "success");
      await queryClient.invalidateQueries({ queryKey: ["factoring", "factors"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to create factor"), "error"),
  });

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Add Factor" variant="drawer">
      <div className="space-y-2 text-xs">
          <label className="block">
            <div className="mb-1">Name</div>
            <input
              value={addForm.name}
              onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="block">
            <div className="mb-1">Advance Rate (0-1)</div>
            <input
              value={addForm.advance_rate}
              onChange={(event) => setAddForm((current) => ({ ...current, advance_rate: event.target.value }))}
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="block">
            <div className="mb-1">Fee Rate (0-1)</div>
            <input
              value={addForm.fee_rate}
              onChange={(event) => setAddForm((current) => ({ ...current, fee_rate: event.target.value }))}
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="block">
            <div className="mb-1">Reserve Rate (0-1)</div>
            <input
              value={addForm.reserve_rate}
              onChange={(event) => setAddForm((current) => ({ ...current, reserve_rate: event.target.value }))}
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="block">
            <div className="mb-1">Recourse Days</div>
            <input
              value={addForm.recourse_days}
              onChange={(event) => setAddForm((current) => ({ ...current, recourse_days: event.target.value }))}
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={addFactorMutation.isPending}
            onClick={() => {
              if (!addForm.name.trim()) {
                pushToast("Factor name is required", "error");
                return;
              }
              void addFactorMutation.mutateAsync();
            }}
          >
            Save
          </Button>
        </div>
    </Modal>
  );
}

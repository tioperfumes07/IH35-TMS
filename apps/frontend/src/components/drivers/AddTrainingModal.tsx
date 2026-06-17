import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { getTrainingCompletions } from "../../api/safety";
import { Button } from "../Button";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  driverId: string;
  companyId: string;
  driverName: string;
  onClose: () => void;
  onCreated?: () => void;
};

function deriveProgramNames(rows: Array<Record<string, unknown>>) {
  const names = new Set<string>();
  for (const row of rows) {
    const name = String(row.training_type ?? row.training_name ?? row.name ?? "").trim();
    if (name) names.add(name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function createDriverTrainingRecord(
  driverId: string,
  companyId: string,
  body: {
    training_name: string;
    completed_at: string;
    expiry_date?: string;
    notes?: string;
  }
) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/mdata/drivers/${driverId}/training?operating_company_id=${encodeURIComponent(companyId)}`,
    { method: "POST", body }
  );
}

export function AddTrainingModal({ open, driverId, companyId, driverName, onClose, onCreated }: Props) {
  const [trainingName, setTrainingName] = useState("");
  const [customName, setCustomName] = useState("");
  const [completedAt, setCompletedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const programsQuery = useQuery({
    queryKey: ["safety", "training-completions", companyId],
    queryFn: () => getTrainingCompletions(companyId),
    enabled: open && Boolean(companyId),
    staleTime: 60_000,
  });

  const programNames = useMemo(
    () => deriveProgramNames(programsQuery.data?.training_completions ?? []),
    [programsQuery.data?.training_completions]
  );

  const resolvedTrainingName = trainingName === "__custom__" ? customName.trim() : trainingName.trim();

  const resetForm = () => {
    setTrainingName("");
    setCustomName("");
    setCompletedAt(new Date().toISOString().slice(0, 10));
    setNotes("");
    setError("");
  };

  const submit = async () => {
    setError("");
    if (!resolvedTrainingName) {
      setError("Training program is required.");
      return;
    }
    if (!completedAt) {
      setError("Completion date is required.");
      return;
    }
    setPending(true);
    try {
      await createDriverTrainingRecord(driverId, companyId, {
        training_name: resolvedTrainingName,
        completed_at: new Date(`${completedAt}T12:00:00`).toISOString(),
        notes: notes.trim() || undefined,
      });
      resetForm();
      onCreated?.();
      onClose();
    } catch {
      setError("Failed to create training record.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Create Training — ${driverName}`}>
      <form
        className="space-y-3"
        data-testid="add-training-modal"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Training program</label>
          <select
            value={trainingName}
            onChange={(event) => setTrainingName(event.target.value)}
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
            data-testid="add-training-program"
            required
          >
            <option value="">Select program</option>
            {programNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="__custom__">Other (type name)</option>
          </select>
        </div>
        {trainingName === "__custom__" ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Program name</label>
            <input
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              className="rounded border border-gray-300 h-9 px-2 text-[13px]"
              data-testid="add-training-custom-name"
              required
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Completion date</label>
          <input
            type="date"
            value={completedAt}
            onChange={(event) => setCompletedAt(event.target.value)}
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
            data-testid="add-training-completed"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            rows={3}
            maxLength={2000}
            data-testid="add-training-notes"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} data-testid="add-training-submit">
            Create Record
          </Button>
        </div>
      </form>
    </Modal>
  );
}

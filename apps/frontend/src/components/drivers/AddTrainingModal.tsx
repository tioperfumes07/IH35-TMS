import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { getTrainingCompletions } from "../../api/safety";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { Modal } from "../Modal";
import { DatePicker } from "../forms/DatePicker";
import { companyToday } from "../../lib/businessDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorState } from "../ListErrorState";

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
  const [completedAt, setCompletedAt] = useState(companyToday());
  const [expiryDate, setExpiryDate] = useState("");
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

  const programOptions = useMemo(
    () => programNames.map((name) => ({ value: name, label: name })),
    [programNames],
  );

  const resolvedTrainingName = trainingName === "__custom__" ? customName.trim() : trainingName.trim();

  const resetForm = () => {
    setTrainingName("");
    setCustomName("");
    setCompletedAt(companyToday());
    setExpiryDate("");
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
        expiry_date: expiryDate || undefined,
        notes: notes.trim() || undefined,
      });
      resetForm();
      onCreated?.();
      onClose();
    } catch (err) {
      setError(userFacingApiError(err, "Failed to create training record."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal variant="drawer" open={open} onClose={onClose} title={`Create Training — ${driverName}`}>
      <form
        className="space-y-3"
        data-testid="add-training-modal"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1" data-testid="add-training-program">
          <label className="text-xs font-semibold text-gray-600">Training program</label>
          {/* LST-F156: bare <select> buried "Other" at the bottom — picker law wants + Add new first. */}
          <Combobox
            options={programOptions}
            value={trainingName === "__custom__" ? null : trainingName || null}
            onChange={(next) => {
              setTrainingName(next ?? "");
              if (next) setCustomName("");
            }}
            placeholder="Select program"
            loading={programsQuery.isLoading}
            allowAddNew={{
              label: "+ Add new program",
              onAdd: () => {
                setTrainingName("__custom__");
                setCustomName("");
              },
            }}
          />
          {programsQuery.isError ? (
            <ListErrorState
              title="Couldn't load existing training programs"
              status={0}
              message={(programsQuery.error as Error)?.message}
              onRetry={() => void programsQuery.refetch()}
            />
          ) : null}
        </div>
        {trainingName === "__custom__" ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Program name</label>
            <input
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
              data-testid="add-training-custom-name"
              required
              autoFocus
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Completion date</label>
          <DatePicker
            value={completedAt}
            onChange={setCompletedAt}
            className="h-9"
            data-testid="add-training-completed"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Expiry date (optional)</label>
          <DatePicker
            value={expiryDate}
            onChange={setExpiryDate}
            min={completedAt}
            className="h-9"
            data-testid="add-training-expiry"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
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

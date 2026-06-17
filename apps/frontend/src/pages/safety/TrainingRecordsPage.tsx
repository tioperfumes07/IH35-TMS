import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSafetyTrainingRecord, getTrainingCompletions } from "../../api/safety";
import { listDrivers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

type Props = {
  operatingCompanyId: string;
};

function expiryLabel(expiryDate: string | null | undefined) {
  if (!expiryDate) return { text: "No expiry", tone: "text-slate-500" };
  const days = Math.ceil((new Date(`${expiryDate}T00:00:00`).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: "Expired", tone: "text-red-700" };
  if (days <= 30) return { text: `Due in ${days}d`, tone: "text-amber-700" };
  return { text: expiryDate, tone: "text-green-700" };
}

export function TrainingRecordsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [trainingName, setTrainingName] = useState("");
  const [completedAt, setCompletedAt] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  const recordsQuery = useQuery({
    queryKey: ["safety", "training-records", operatingCompanyId],
    queryFn: () => getTrainingCompletions(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const driversQuery = useQuery({
    queryKey: ["mdata", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, status: "Active" }),
    enabled: Boolean(operatingCompanyId),
  });

  const driverNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const driver of driversQuery.data?.drivers ?? []) {
      map.set(driver.id, `${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim() || driver.id);
    }
    return map;
  }, [driversQuery.data?.drivers]);

  const createMutation = useMutation({
    mutationFn: () =>
      createSafetyTrainingRecord(operatingCompanyId, {
        driver_id: driverId,
        training_name: trainingName.trim(),
        completed_at: new Date(`${completedAt}T12:00:00`).toISOString(),
        expiry_date: expiryDate || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setDriverId("");
      setTrainingName("");
      setExpiryDate("");
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["safety", "training-records", operatingCompanyId] });
      void queryClient.invalidateQueries({ queryKey: ["safety", "training-completions", operatingCompanyId] });
    },
  });

  const rows = recordsQuery.data?.training_completions ?? [];

  return (
    <div className="space-y-3" data-testid="training-records-page">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Training Records</div>
          <div className="text-[11px] text-slate-500">Per-driver completion history with expiry tracking.</div>
        </div>
        <Button size="sm" data-testid="training-records-create-btn" onClick={() => setCreateOpen(true)}>
          + Create Record
        </Button>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs" data-testid="training-records-table">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Completed</th>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Training</th>
              <th className="px-2 py-1 text-left">Expiry</th>
              <th className="px-2 py-1 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expiry = expiryLabel((row.expiry_date as string | undefined) ?? (row.due_at as string | undefined));
              return (
                <tr key={String(row.id)} className="border-t border-gray-100" data-testid={`training-record-row-${String(row.id)}`}>
                  <td className="px-2 py-1">{String(row.completed_at ?? "").slice(0, 10)}</td>
                  <td className="px-2 py-1">{driverNameById.get(String(row.driver_id ?? "")) ?? String(row.driver_id ?? "—")}</td>
                  <td className="px-2 py-1">{String(row.training_type ?? row.training_name ?? row.name ?? "Training")}</td>
                  <td className="px-2 py-1">{String(row.expiry_date ?? row.due_at ?? "—")}</td>
                  <td className={`px-2 py-1 ${expiry.tone}`}>{expiry.text}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                  No training records found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Training Record">
        <form
          className="space-y-3"
          data-testid="training-record-create-modal"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="block text-xs text-slate-600">
            Driver
            <select
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
              className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
              data-testid="training-record-driver"
              required
            >
              <option value="">Select driver</option>
              {(driversQuery.data?.drivers ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {`${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim() || driver.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-600">
            Training name
            <input
              value={trainingName}
              onChange={(event) => setTrainingName(event.target.value)}
              className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
              data-testid="training-record-name"
              required
            />
          </label>
          <label className="block text-xs text-slate-600">
            Completed date
            <input
              type="date"
              value={completedAt}
              onChange={(event) => setCompletedAt(event.target.value)}
              className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
              data-testid="training-record-completed"
              required
            />
          </label>
          <label className="block text-xs text-slate-600">
            Expiry date (optional)
            <DatePicker
              value={expiryDate}
              onChange={(next) => setExpiryDate(next)}
              className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
              data-testid="training-record-expiry"
            />
          </label>
          <label className="block text-xs text-slate-600">
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 block min-h-16 w-full rounded border border-gray-200 px-2 py-1 text-xs"
              data-testid="training-record-notes"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={createMutation.isPending} data-testid="training-record-submit">
              Create Record
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default TrainingRecordsPage;

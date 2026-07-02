import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSafetyTrainingRecord, getTrainingCompletions } from "../../api/safety";
import { listDrivers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { companyToday } from "../../lib/businessDate";

type TrainingRecordRow = Record<string, unknown>;

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
  const [completedAt, setCompletedAt] = useState(companyToday());
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

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row expiry status tone
  // are preserved verbatim (§7 additive-only).
  const recordColumns: Array<ParityColumn<TrainingRecordRow>> = [
    { key: "completed_at", label: "Completed", sortable: true, render: (row) => String(row.completed_at ?? "").slice(0, 10) },
    {
      key: "driver_id",
      label: "Driver",
      render: (row) => driverNameById.get(String(row.driver_id ?? "")) ?? String(row.driver_id ?? "—"),
    },
    {
      key: "training_name",
      label: "Training",
      sortable: true,
      render: (row) => String(row.training_type ?? row.training_name ?? row.name ?? "Training"),
    },
    { key: "expiry_date", label: "Expiry", sortable: true, render: (row) => String(row.expiry_date ?? row.due_at ?? "—") },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        const expiry = expiryLabel((row.expiry_date as string | undefined) ?? (row.due_at as string | undefined));
        return <span className={expiry.tone}>{expiry.text}</span>;
      },
    },
  ];

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

      <ParityTable<TrainingRecordRow>
        columns={recordColumns}
        rows={rows}
        rowKey={(row) => String(row.id)}
        loading={recordsQuery.isLoading}
        emptyText="No training records found."
        storageKey="safety-training-records"
        exportFilename="training-records"
        tableTestId="training-records-table"
        rowTestId={(row) => `training-record-row-${String(row.id)}`}
      />

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
            <DatePicker
              value={completedAt}
              onChange={setCompletedAt}
              max={new Date().toISOString().slice(0, 10)}
              className="mt-1 block w-full"
              data-testid="training-record-completed"
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

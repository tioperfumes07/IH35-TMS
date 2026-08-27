import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { formatDateUS } from "../../lib/formatDate";
import { Link } from "react-router-dom";

function statusClass(status: string | undefined) {
  if (status === "red") return "text-red-700";
  if (status === "yellow") return "text-yellow-700";
  if (status === "green") return "text-green-700";
  return "text-gray-600";
}

type TrainingRecordRow = Record<string, unknown> & { __rowKey: string };

export function TrainingRecordsSection({
  records,
  totalCount,
  driverId,
  unavailable = false,
  onAddTraining,
}: {
  records: Array<Record<string, unknown>>;
  totalCount: number;
  driverId: string;
  unavailable?: boolean;
  onAddTraining?: () => void;
}) {
  const rows: TrainingRecordRow[] = records.map((row, index) => ({
    ...row,
    __rowKey: `${String(row.type ?? "training")}-${index}`,
  }));

  const columns: Array<ParityColumn<TrainingRecordRow>> = [
    { key: "type", label: "Type", render: (row) => String(row.type ?? "—") },
    {
      key: "completion_date",
      label: "Completed",
      render: (row) => formatDateUS(row.completion_date as string) || "—",
    },
    {
      key: "expiration_date",
      label: "Expiration",
      render: (row) => <span className={statusClass(String(row.status))}>{String(row.expiration_date ?? "—")}</span>,
    },
    { key: "certificate_url", label: "Certificate", render: (row) => (row.certificate_url ? "On file" : "—") },
  ];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Training records</h2>
        <button
          type="button"
          className="text-xs text-slate-700 underline disabled:cursor-not-allowed disabled:text-gray-400"
          data-testid="dp-add-training"
          onClick={onAddTraining}
          disabled={!onAddTraining}
        >
          + Add training
        </button>
      </div>
      <div className="mt-3">
        {unavailable ? <p className="mb-2 text-xs font-medium text-red-700">Training records could not be loaded.</p> : null}
        <ParityTable<TrainingRecordRow>
          rows={rows}
          rowKey={(row) => row.__rowKey}
          emptyText="No training records."
          columns={columns}
          storageKey="dp-training-records"
        />
        {totalCount > rows.length ? (
          <div className="mt-2 flex items-center justify-between text-xs" data-testid="driver-training-records-range-disclosure">
            <span className="text-gray-600">Showing {rows.length} of {totalCount} records.</span>
            <Link className="font-medium text-slate-700 underline" to={`/safety/training-records?driver_id=${encodeURIComponent(driverId)}`}>
              Open full training history
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

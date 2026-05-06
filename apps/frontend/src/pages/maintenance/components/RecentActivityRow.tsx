import type { WorkOrder } from "../../../api/maintenance";

type Props = {
  recent: WorkOrder[];
  completed: WorkOrder[];
  onOpen: (id: string) => void;
};

function Table({ title, rows, onOpen }: { title: string; rows: WorkOrder[]; onOpen: (id: string) => void }) {
  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</div>
      <div>
        {rows.map((row) => (
          <button key={row.id} type="button" onClick={() => onOpen(row.id)} className="flex w-full items-center justify-between border-b border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50">
            <span className="font-semibold">{row.display_id ?? row.id.slice(0, 8)}</span>
            <span>{row.wo_type}</span>
            <span className="text-gray-500">{row.status}</span>
          </button>
        ))}
        {rows.length === 0 ? <div className="px-2 py-2 text-xs text-gray-500">No entries.</div> : null}
      </div>
    </div>
  );
}

export function RecentActivityRow({ recent, completed, onOpen }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      <Table title="Recent Work Orders" rows={recent} onOpen={onOpen} />
      <Table title="Recently Completed" rows={completed} onOpen={onOpen} />
    </div>
  );
}

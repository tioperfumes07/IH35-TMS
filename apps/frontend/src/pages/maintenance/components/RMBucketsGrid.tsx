import type { WorkOrder } from "../../../api/maintenance";

type Props = {
  inHouse: WorkOrder[];
  external: WorkOrder[];
  roadside: WorkOrder[];
  onOpen: (id: string) => void;
};

function Bucket({
  title,
  rows,
  accentClass,
  onOpen,
}: {
  title: string;
  rows: WorkOrder[];
  accentClass: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className={`rounded border ${accentClass} bg-white`}>
      <div className="border-b border-gray-200 px-2 py-1 text-xs font-semibold uppercase tracking-wide">{title}</div>
      <div className="max-h-44 overflow-y-auto">
        {rows.map((row) => (
          <button key={row.id} type="button" onClick={() => onOpen(row.id)} className="flex w-full items-center justify-between border-b border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50">
            <span className="font-semibold">{row.display_id ?? row.id.slice(0, 8)}</span>
            <span className="text-gray-500">{row.description ?? row.wo_type}</span>
          </button>
        ))}
        {rows.length === 0 ? <div className="px-2 py-2 text-xs text-gray-500">No units</div> : null}
      </div>
    </div>
  );
}

export function RMBucketsGrid({ inHouse, external, roadside, onOpen }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
      <Bucket title="In-house · Main Bay" rows={inHouse} accentClass="border-gray-200" onOpen={onOpen} />
      <Bucket title="External Shop" rows={external} accentClass="border-gray-200" onOpen={onOpen} />
      <Bucket title="Roadside" rows={roadside} accentClass="border-amber-300" onOpen={onOpen} />
    </div>
  );
}

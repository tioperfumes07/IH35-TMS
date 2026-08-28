import { entityLabel } from "../../../lib/entity-label";
import type { WorkOrder } from "../../../api/maintenance";
import { EntityLink } from "../../../components/shared/EntityLink";

type Props = {
  recent: WorkOrder[];
  completed: WorkOrder[];
  recentTotalCount: number;
  completedTotalCount: number;
  pageSize: number;
  recentPage: number;
  completedPage: number;
  fetching: boolean;
  onRecentPageChange: (page: number) => void;
  onCompletedPageChange: (page: number) => void;
  onOpen: (id: string) => void;
};

function Table({ title, rows, totalCount, page, pageSize, fetching, onPageChange, onOpen }: { title: string; rows: WorkOrder[]; totalCount: number; page: number; pageSize: number; fetching: boolean; onPageChange: (page: number) => void; onOpen: (id: string) => void }) {
  return (
    <div className="rounded-sm border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</div>
      <div>
        {totalCount > rows.length ? (
          <div className="border-b border-gray-100 px-2 py-1 text-xs text-slate-500" data-testid="maintenance-recent-activity-range">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount} work orders.
          </div>
        ) : null}
        {rows.map((row) => (
          <div key={row.id} className="flex w-full items-center justify-between border-b border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50">
            <EntityLink kind="work_order" id={row.id} label={entityLabel(row.display_id, row.id, "Work order")} className="font-semibold" onClick={(event) => { event.preventDefault(); onOpen(row.id); }} />
            <span>{row.wo_type}</span>
            <span className="text-gray-500">{row.status}</span>
          </div>
        ))}
        {rows.length === 0 ? <div className="px-2 py-2 text-xs text-gray-500">No entries.</div> : null}
        {totalCount > pageSize ? (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-2 py-1 text-xs" data-testid={`maintenance-${title.toLowerCase().replace(/\s+/g, "-")}-pager`}>
            <button type="button" disabled={page === 0 || fetching} onClick={() => onPageChange(Math.max(0, page - 1))}>Previous</button>
            <button type="button" disabled={(page + 1) * pageSize >= totalCount || fetching} onClick={() => onPageChange(page + 1)}>Next</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RecentActivityRow({ recent, completed, recentTotalCount, completedTotalCount, pageSize, recentPage, completedPage, fetching, onRecentPageChange, onCompletedPageChange, onOpen }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      <Table title="Recent Work Orders" rows={recent} totalCount={recentTotalCount} page={recentPage} pageSize={pageSize} fetching={fetching} onPageChange={onRecentPageChange} onOpen={onOpen} />
      <Table title="Recently Completed" rows={completed} totalCount={completedTotalCount} page={completedPage} pageSize={pageSize} fetching={fetching} onPageChange={onCompletedPageChange} onOpen={onOpen} />
    </div>
  );
}

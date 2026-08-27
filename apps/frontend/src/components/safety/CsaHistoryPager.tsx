type Props = {
  page: number;
  pageSize: number;
  totalCount: number;
  fetching: boolean;
  onPageChange: (page: number) => void;
  testId: string;
};

export function CsaHistoryPager({ page, pageSize, totalCount, fetching, onPageChange, testId }: Props) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  return (
    <div className="flex items-center justify-between text-xs text-slate-600" data-testid={testId}>
      <span>{totalCount === 0 ? "0 of 0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-40" disabled={page <= 1 || fetching} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</button>
        <span>Page {page} of {pageCount}</span>
        <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-40" disabled={page >= pageCount || fetching} onClick={() => onPageChange(Math.min(pageCount, page + 1))}>Next</button>
      </div>
    </div>
  );
}

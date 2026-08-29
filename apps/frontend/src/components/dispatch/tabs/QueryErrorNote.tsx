/**
 * QueryErrorNote — DSP-MONEY-F7283 shared load-drawer read-health contract.
 *
 * FactoringTab and FinesDeductionsCard each consume several React Query feeds and, on failure,
 * used to default the query's data to an empty collection with no `.isError` check anywhere —
 * indistinguishable from a genuine "nothing here" state, but for money-adjacent surfaces (a
 * factoring packet checklist, submission eligibility, fine/escrow deductions, settlement status)
 * that silence can hide a real fetch failure behind a false "complete"/"empty"/"eligible" read.
 *
 * One small shared component, used identically at every failing feed named in the finding: names
 * the failing feed and gives an exact-query Retry (the query's own `.refetch()`, not a full page
 * reload), so a caller only needs `{queryX.isError ? <QueryErrorNote .../> : <existing empty/derived
 * copy>}` at each site instead of inventing its own per-feed error text.
 */
export function QueryErrorNote({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <p className="text-xs text-red-700" role="alert">
      Couldn't load {label}.{" "}
      <button type="button" onClick={onRetry} className="font-semibold underline">
        Retry
      </button>
    </p>
  );
}

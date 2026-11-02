# Handoff → Cascade (or Lead SURFACE-BREACH) — InvoiceSearch + P&L URL seed

Cursor cannot land `pages/reports/**` (verify-seat-surface-ownership → Cascade).
Shared remount fix already shipping on Cursor: ReportFilterBar `syncUrlMany` + Suspense `key={location.pathname}`.

## InvoiceSearchReportPage.tsx queryFn
Replace the "2+ statuses → fetch without status then client-filter page 1" path with:

```ts
const status =
  appliedFilters.statusFilter.length === 0
    ? undefined
    : appliedFilters.statusFilter.length === 1
      ? appliedFilters.statusFilter[0]
      : appliedFilters.statusFilter;
return listInvoices(operatingCompanyId, {
  search: appliedFilters.search || undefined,
  status,
  ...dateRange,
  sort: sortKey || undefined,
  dir: sortDirection || undefined,
  limit: 100,
  offset: 0,
});
```

Backend already accepts `status` arrays (invoices.routes.ts U12). Guard sketch: `scripts/verify-invoice-search-multistatus-server.mjs` (was drafted on Cursor; re-add with the page fix).

## ProfitLossPage.tsx URL seed
```ts
function filtersFromSearchParams(sp: URLSearchParams) {
  const from = sp.get("from_date");
  const to = sp.get("to_date");
  const basisRaw = sp.get("basis");
  const basis = basisRaw === "cash" || basisRaw === "accrual" ? basisRaw : "accrual";
  if (from && to) return { start: from, end: to, basis };
  return { ...currentMonthRange(), basis };
}
// useState(() => filtersFromSearchParams(searchParams))
// onPresetSelect can be a no-op — ReportFilterBar already writes from_date/to_date/preset atomically.
```

Codex Round 7.6 — Last month must stage both dates with Apply enabled; shared Suspense key fix is the remount root cause.

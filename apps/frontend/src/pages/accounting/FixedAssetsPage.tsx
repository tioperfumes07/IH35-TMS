import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { useUrlSort } from "../../hooks/useUrlSort";
import { useAuth } from "../../auth/useAuth";
import { ApiError } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import {
  getFixedAssets, getFixedAssetDetail, registerTrkOwnedUnits,
  type FixedAssetListItem, type FixedAssetDetail, type RegisterTrkUnitsResult,
} from "../../api/fixed-assets";

const fmtCents = (c: number) => formatUsdCents(c);
const fmtDate = (s: string | null) => formatDateUS(s) || "—";
const titleize = (s: string) => s.replace(/_/g, " ");

const STATUS_COLOR: Record<string, string> = {
  active: "bg-slate-100 text-slate-700",
  fully_depreciated: "bg-slate-100 text-slate-700",
  disposed: "bg-slate-100 text-slate-700",
  voided: "bg-red-100 text-red-700",
};

const PRICES_JSON_EXAMPLE = `{
  "T169": 85000000,
  "T170": 92000000
}`;

type ParsedPrices =
  | { ok: true; map: Record<string, number> }
  | { ok: false; error: string };

export function parseOwnerPricesJson(raw: string): ParsedPrices {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste a JSON map of unit_number → purchase_price_cents." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Invalid JSON — expected an object like { \"T169\": 85000000 }." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Expected a JSON object mapping unit_number → positive integer cents." };
  }

  const map: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const unitNumber = String(key).trim();
    if (!unitNumber) continue;
    const cents = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(cents) || cents <= 0) {
      return { ok: false, error: `Unit ${unitNumber}: price must be a positive integer (cents).` };
    }
    map[unitNumber] = cents;
  }

  if (Object.keys(map).length === 0) {
    return { ok: false, error: "At least one unit price is required — the system never invents dollars." };
  }

  return { ok: true, map };
}

function RegisterResultSummary({ result }: { result: RegisterTrkUnitsResult }) {
  return (
    <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 space-y-2" data-testid="fa-register-result">
      <p><span className="font-semibold">Registered:</span> {result.registered}</p>
      <p><span className="font-semibold">Skipped (already registered):</span> {result.skipped_already}</p>
      {result.missing_price.length > 0 && (
        <p><span className="font-semibold">Missing price:</span> {result.missing_price.join(", ")}</p>
      )}
      {result.accum_depr_unresolved.length > 0 && (
        <p><span className="font-semibold">Accum. depr unresolved:</span> {result.accum_depr_unresolved.join(", ")}</p>
      )}
      {result.errors.length > 0 && (
        <div>
          <span className="font-semibold">Errors:</span>
          <ul className="list-disc pl-4 mt-1">
            {result.errors.map((e) => (
              <li key={`${e.unit_number}-${e.reason}`}>{e.unit_number}: {e.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TrkBulkRegisterPanel({
  trkCompanyId,
  onClose,
  onSuccess,
}: {
  trkCompanyId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pricesText, setPricesText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RegisterTrkUnitsResult | null>(null);

  const parsed = useMemo(() => parseOwnerPricesJson(pricesText), [pricesText]);
  const pricesMap = parsed.ok ? parsed.map : {};

  useEffect(() => {
    setParseError(parsed.ok ? null : (pricesText.trim() ? parsed.error : null));
  }, [parsed, pricesText]);

  const registerMutation = useMutation({
    mutationFn: () =>
      registerTrkOwnedUnits({
        operating_company_id: trkCompanyId,
        owner_operating_company_id: trkCompanyId,
        pricesByUnitNumber: pricesMap,
      }),
    onSuccess: (result) => {
      setLastResult(result);
      onSuccess();
    },
  });

  const onFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPricesText(text);
    event.target.value = "";
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}
        data-testid="fa-trk-bulk-register-panel"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Register TRK-owned units</h2>
            <p className="text-xs text-gray-500 mt-1">
              Bulk register fixed assets on TRK books. Purchase prices are owner-provided only — units without an explicit cents value are skipped (missing_price).
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4" aria-label="Close">×</button>
        </div>

        <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="fa-prices-json">
          Unit prices (JSON map: unit_number → cents)
        </label>
        <textarea
          id="fa-prices-json"
          data-testid="fa-prices-json"
          value={pricesText}
          onChange={(e) => setPricesText(e.target.value)}
          rows={8}
          placeholder={PRICES_JSON_EXAMPLE}
          className="w-full rounded-sm border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-hidden focus:ring-1 focus:ring-slate-500"
        />
        {parseError ? <p className="mt-1 text-xs text-red-600">{parseError}</p> : null}

        <div className="mt-2">
          <label className="text-xs text-slate-600">
            Or upload JSON file
            <input type="file" accept=".json,application/json" className="ml-2 text-xs" onChange={onFileChange} />
          </label>
        </div>

        {registerMutation.isError && (
          <p className="mt-2 text-xs text-red-600">
            {(registerMutation.error as Error)?.message ?? "Registration failed."}
          </p>
        )}

        {lastResult ? <RegisterResultSummary result={lastResult} /> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
            Close
          </button>
          <button
            type="button"
            data-testid="fa-register-trk-submit"
            disabled={registerMutation.isPending || Object.keys(pricesMap).length === 0 || !parsed.ok}
            onClick={() => void registerMutation.mutate()}
            className="rounded-sm bg-slate-800 text-white px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-slate-700"
          >
            {registerMutation.isPending ? "Registering…" : "Register with owner prices"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ detail, onClose }: { detail: FixedAssetDetail; onClose: () => void }) {
  const cost = detail.purchase_price_cents;
  const pct = cost > 0 ? Math.round((detail.depreciation_to_date_cents / Math.max(1, cost - detail.salvage_value_cents)) * 100) : 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{detail.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {detail.asset_number ? `#${detail.asset_number} · ` : ""}{detail.class_name ?? "—"} · {titleize(detail.method)} · {detail.useful_life_months} mo · {titleize(detail.convention)}
            </p>
            {!detail.is_owner_operated && detail.owner_company_name && (
              <p className="text-xs text-slate-600 mt-0.5">Owned by {detail.owner_company_name} (operated here)</p>
            )}
            {detail.unit_uuid ? (
              <p className="text-xs text-slate-600 mt-0.5">
                Unit: <EntityLink kind="unit" id={detail.unit_uuid} label={entityLabel(detail.vin_serial, detail.unit_uuid, "Unit")} />
              </p>
            ) : null}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
          <div><div className="text-xs text-gray-500">Cost</div><div className="tabular-nums">{fmtCents(detail.purchase_price_cents)}</div></div>
          <div><div className="text-xs text-gray-500">Salvage</div><div className="tabular-nums">{fmtCents(detail.salvage_value_cents)}</div></div>
          <div><div className="text-xs text-gray-500">Depr. to date</div><div className="tabular-nums text-slate-700">{fmtCents(detail.depreciation_to_date_cents)}</div></div>
          <div><div className="text-xs text-gray-500">Net book value</div><div className="tabular-nums font-semibold">{fmtCents(detail.net_book_value_cents)}</div></div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Depreciated</span><span>{pct}%</span></div>
          <div className="h-2 rounded-full bg-gray-200"><div className="h-2 rounded-full bg-slate-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} /></div>
        </div>

        {detail.disposal && (
          <div className="mb-4 rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-semibold mb-1">Disposed {fmtDate(detail.disposal.disposal_date)} ({titleize(detail.disposal.disposal_type)})</p>
            <p>Proceeds {fmtCents(detail.disposal.proceeds_cents)} · Book value {fmtCents(detail.disposal.book_value_at_disposal_cents)} · {detail.disposal.gain_loss_cents >= 0 ? "Gain" : "Loss"} {fmtCents(Math.abs(detail.disposal.gain_loss_cents))}</p>
          </div>
        )}

        {detail.je_preview.depreciation_je_template && (
          <div className="mb-4 rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-semibold mb-1">
              {detail.je_preview.manual_posting_enabled
                ? "GL Posting (manual trigger enabled for this entity)"
                : "GL Posting Preview (GATED — posting not yet enabled for this entity)"}
            </p>
            <p>Per-period JE: Dr Depreciation Expense / Cr Accumulated Depreciation</p>
            {detail.last_posted_journal_entry_id ? (
              <p className="mt-1">
                Last posted through period {detail.last_posted_period_number}:{" "}
                <EntityLink kind="journal_entry" id={detail.last_posted_journal_entry_id} label="Journal entry" />
              </p>
            ) : null}
          </div>
        )}

        {detail.schedule_note && (
          <p className="mb-3 text-xs text-gray-500 rounded-sm bg-gray-50 px-2 py-1">{detail.schedule_note}</p>
        )}

        <div className="overflow-y-auto overflow-x-auto flex-1 rounded-sm border border-gray-200">
          <table className="min-w-full text-xs divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {["#", "Period", "Depreciation", "Accumulated", "Book Value", "JE"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {detail.schedule.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">No schedule to display.</td></tr>
              ) : detail.schedule.map((row) => (
                <tr key={row.period_number} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-500">{row.period_number}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(row.period_date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtCents(row.depreciation_amount_cents)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtCents(row.accumulated_to_date_cents)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtCents(row.book_value_end_cents)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap" data-testid={`fixed-asset-schedule-je-${row.period_number}`}>
                    {row.posted && row.posted_journal_entry_id ? (
                      <EntityLink kind="journal_entry" id={row.posted_journal_entry_id} label="Posted" />
                    ) : (
                      <span className="text-gray-400">Not posted</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function FixedAssetsPage() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag("FIXED_ASSETS_ENABLED", operatingCompanyId || undefined);
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState("");
  const staged = useStagedListFilters({ applied: { statusFilter }, empty: { statusFilter: "" }, onApply: (next) => { setStatusFilter(next.statusFilter); setOffset(0); } });
  const [offset, setOffset] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(searchParams.get("asset_id"));
  const [registerOpen, setRegisterOpen] = useState(false);
  const limit = 50;
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  const trkCompany = useMemo(
    () => companies.find((c) => c.code === "TRK" || c.company_type === "asset_holder") ?? null,
    [companies],
  );
  const canBulkRegister = (user?.role === "Owner" || user?.role === "Administrator") && Boolean(trkCompany);

  useEffect(() => {
    const assetId = searchParams.get("asset_id");
    if (assetId) setDetailId(assetId);
  }, [searchParams]);

  const openDetail = (id: string) => {
    setDetailId(id);
    const next = new URLSearchParams(searchParams);
    next.set("asset_id", id);
    setSearchParams(next, { replace: true });
  };

  const closeDetail = () => {
    setDetailId(null);
    if (!searchParams.get("asset_id")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("asset_id");
    setSearchParams(next, { replace: true });
  };

  const assetsQuery = useQuery({
    queryKey: ["fixed-assets", operatingCompanyId, statusFilter, offset],
    queryFn: () => getFixedAssets({ operating_company_id: operatingCompanyId, status: statusFilter || undefined, limit, offset }),
    enabled: Boolean(selectedCompanyId) && enabled,
  });
  const { data, isPending, isFetching, isError } = assetsQuery;

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["fixed-asset-detail", detailId, operatingCompanyId],
    queryFn: () => getFixedAssetDetail(detailId!, operatingCompanyId),
    enabled: Boolean(detailId && operatingCompanyId) && enabled,
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  const columns = useMemo<ParityColumn<FixedAssetListItem>[]>(
    () => [
      { key: "asset_number", label: "#", sortable: true, render: (row) => row.asset_number ?? "—" },
      {
        key: "name",
        label: "Name",
        sortable: true,
        render: (row) => (
          <button onClick={() => openDetail(row.id)} className="text-slate-700 hover:underline text-left font-medium">{row.name}</button>
        ),
      },
      { key: "class_name", label: "Class", sortable: true, render: (row) => row.class_name ?? "—" },
      { key: "in_service_date", label: "In Service", sortable: true, render: (row) => fmtDate(row.in_service_date) },
      { key: "method", label: "Method", sortable: true, render: (row) => <span className="capitalize">{titleize(row.method)}</span> },
      { key: "purchase_price_cents", label: "Cost", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => fmtCents(row.purchase_price_cents) },
      {
        key: "depreciation_to_date_cents",
        label: "Depr. to date",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums text-slate-700",
        render: (row) => fmtCents(row.depreciation_to_date_cents),
      },
      {
        key: "net_book_value_cents",
        label: "Net Book Value",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums font-semibold",
        render: (row) => fmtCents(row.net_book_value_cents),
      },
      {
        key: "owner_company_name",
        label: "Owner",
        sortable: true,
        sortValue: (row) => (row.is_owner_operated ? "Self" : (row.owner_company_name ?? "Leased-in")),
        render: (row) => (row.is_owner_operated ? "Self" : (row.owner_company_name ?? "Leased-in")),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => (
          <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.status] ?? "bg-gray-100 text-gray-600"}`}>
            {titleize(row.status)}
          </span>
        ),
      },
    ],
    [openDetail],
  );

  const filterBar = (
    <div className="flex flex-wrap gap-2 items-center" data-fixed-assets-filter-toolbar="collapsed">
      <CollapsedListFilters activeFilterCount={statusFilter ? 1 : 0} testIdPrefix="fixed-assets" onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}>
        <select
          value={staged.draft.statusFilter}
          onChange={(e) => staged.setDraft({ statusFilter: e.target.value })}
          className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-slate-500"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="fully_depreciated">Fully Depreciated</option>
          <option value="disposed">Disposed</option>
          <option value="voided">Voided</option>
        </select>
      </CollapsedListFilters>
      <span className="text-xs text-gray-500">
        {total.toLocaleString()} asset{total !== 1 ? "s" : ""}
      </span>
      {canBulkRegister ? (
        <button
          type="button"
          data-testid="fa-open-trk-register"
          onClick={() => setRegisterOpen(true)}
          className="ml-auto rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
        >
          Register TRK units
        </button>
      ) : null}
    </div>
  );

  if (!flagLoading && !enabled) {
    return (
      <AccountingSubNavWrapper title="Fixed Assets" subtitle="Fixed asset register and depreciation schedules">
        <div className="rounded-sm border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          Fixed asset tracking is not yet enabled for this account.
          <p className="mt-1 text-xs text-gray-400">This module is turned on per operating company and isn’t active for the company you have selected — this is expected, not an error. Contact the owner or an administrator to enable it, or switch to a company where it’s already on.</p>
        </div>
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper title="Fixed Assets" subtitle="Asset register, depreciation schedule, and disposals (read-only; GL posting gated)">
      <div className="mb-3 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800" data-testid="fa-density-honesty-banner">
        Register density requires owner-provided purchase prices per unit (cents). Bulk registration never invents dollar amounts — units without an explicit price remain in <span className="font-medium">missing_price</span> until the owner supplies them.
      </div>

      {registerOpen && trkCompany ? (
        <TrkBulkRegisterPanel
          trkCompanyId={trkCompany.id}
          onClose={() => setRegisterOpen(false)}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
          }}
        />
      ) : null}

      {detailId && detail && !detailLoading && (
        <DetailPanel detail={detail} onClose={closeDetail} />
      )}

      {isError ? (
        <ListErrorState
          title="Failed to load fixed assets."
          status={assetsQuery.error instanceof ApiError ? assetsQuery.error.status : 0}
          message={(assetsQuery.error as Error | null)?.message}
          onRetry={() => void assetsQuery.refetch()}
        />
      ) : null}

      <ParityTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.id}
        loading={flagLoading || isPending || (isFetching && items.length === 0)}
        filterBar={filterBar}
        storageKey="fixed-assets-list"
        tableTestId="fixed-assets-table"
        initialPageSize={limit}
        emptyText="No fixed assets found."
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
      />

      {total > limit && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
            className="rounded-sm border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span>{offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}
            className="rounded-sm border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}

export default FixedAssetsPage;

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listQboSyncConflicts,
  type QboConflictEntityType,
  type QboConflictType,
  type QboSyncConflictRow,
} from "../../api/qbo-integration";
import { Button } from "../../components/Button";
import { ReportBlockVPendingBanner } from "../reports/ReportBlockVPendingBanner";

const ENTITY_OPTIONS: Array<{ label: string; value: QboConflictEntityType }> = [
  { label: "Customer", value: "customer" },
  { label: "Vendor", value: "vendor" },
  { label: "Product", value: "product" },
  { label: "Account", value: "account" },
];

const CONFLICT_OPTIONS: Array<{ label: string; value: QboConflictType | "all" }> = [
  { label: "All", value: "all" },
  { label: "Field Drift", value: "field_drift" },
  { label: "Missing in QBO", value: "missing_in_qbo" },
  { label: "Missing in Mirror", value: "missing_in_mirror" },
];

export function ConflictsTab({ operatingCompanyId }: { operatingCompanyId: string }) {
  const [entityType, setEntityType] = useState<QboConflictEntityType>("customer");
  const [conflictType, setConflictType] = useState<QboConflictType | "all">("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const query = useQuery({
    queryKey: ["qbo", "sync-conflicts", operatingCompanyId, entityType, conflictType, cursor],
    queryFn: () =>
      listQboSyncConflicts({
        operating_company_id: operatingCompanyId,
        entity: entityType,
        conflict_type: conflictType === "all" ? undefined : conflictType,
        limit: 50,
        cursor,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = query.data?.items ?? [];
  const nextCursor = query.data?.next_cursor ?? null;

  const countByType = useMemo(() => {
    const counts: Record<string, number> = { field_drift: 0, missing_in_qbo: 0, missing_in_mirror: 0 };
    for (const row of rows) counts[row.conflict_type] = (counts[row.conflict_type] ?? 0) + 1;
    return counts;
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Entity Type</div>
        <div className="flex flex-wrap gap-2">
          {ENTITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setEntityType(option.value);
                setCursor(undefined);
                setExpanded(new Set());
              }}
              className={`rounded border px-2 py-1 text-xs ${
                entityType === option.value ? "border-slate-300 bg-slate-100 text-slate-700" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Conflict Type</div>
        <div className="flex flex-wrap gap-2">
          {CONFLICT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setConflictType(option.value);
                setCursor(undefined);
                setExpanded(new Set());
              }}
              className={`rounded border px-2 py-1 text-xs ${
                conflictType === option.value ? "border-slate-300 bg-slate-100 text-slate-700" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-2 text-xs text-gray-600">
          field_drift={countByType.field_drift} · missing_in_qbo={countByType.missing_in_qbo} · missing_in_mirror=
          {countByType.missing_in_mirror}
        </div>
      </div>

      {query.isError ? <ReportBlockVPendingBanner error={query.error} onRetry={() => void query.refetch()} /> : null}

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        {query.isLoading ? <p className="p-3 text-sm text-gray-500">Loading conflict detections…</p> : null}
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
            <tr>
              <th className="px-2 py-2">Entity</th>
              <th className="px-2 py-2">QBO ID</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Summary</th>
              <th className="px-2 py-2">Detected</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: QboSyncConflictRow) => {
              const rowId = `${row.entity_type}:${row.mirror_id}:${row.conflict_type}`;
              return (
                <Fragment key={rowId}>
                  <tr
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(rowId)) next.delete(rowId);
                        else next.add(rowId);
                        return next;
                      })
                    }
                  >
                    <td className="px-2 py-2 capitalize">{row.entity_type}</td>
                    <td className="px-2 py-2 font-mono text-[11px]">{row.qbo_id ?? "—"}</td>
                    <td className="px-2 py-2">{row.conflict_type}</td>
                    <td className="px-2 py-2">{row.summary}</td>
                    <td className="px-2 py-2">{new Date(row.detected_at).toLocaleString()}</td>
                  </tr>
                  {expanded.has(rowId) ? (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="p-2">
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="rounded border border-gray-200 bg-white p-2">
                            <div className="mb-1 text-[11px] font-semibold uppercase text-gray-600">Mirror Snapshot</div>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                              {JSON.stringify(row.mirror_snapshot, null, 2)}
                            </pre>
                          </div>
                          <div className="rounded border border-gray-200 bg-white p-2">
                            <div className="mb-1 text-[11px] font-semibold uppercase text-gray-600">QBO Snapshot</div>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                              {JSON.stringify(row.qbo_snapshot, null, 2)}
                            </pre>
                          </div>
                        </div>
                        {row.diff.length > 0 ? (
                          <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px]">
                            <div className="mb-1 font-semibold uppercase text-amber-900">Diff</div>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all">
                              {JSON.stringify(row.diff, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!query.isLoading && rows.length === 0 ? <p className="p-3 text-sm text-gray-500">No conflicts detected for this filter.</p> : null}
      </div>

      <div className="flex justify-end">
        <Button disabled={!nextCursor} onClick={() => setCursor(nextCursor ?? undefined)}>
          Load older
        </Button>
      </div>
    </div>
  );
}

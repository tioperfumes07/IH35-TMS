import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateUS } from "../../lib/formatDate";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { resolveApiUrl } from "../../api/client";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorState } from "../../components/ListErrorState";
import { Button } from "../../components/Button";

// SAF-F06: these page-local helpers called bare fetch(path), so with
// VITE_API_BASE_URL set and NO /api rewrite on the static site the request hit
// app.ih35dispatch.com and got index.html back with HTTP 200 — res.ok was true, the
// !res.ok guard never fired, and res.json() threw on HTML. Every load failed silently
// and rendered as empty data. resolveApiUrl() is the shared client's URL resolver.
async function apiGet(path: string) {
  const res = await fetch(resolveApiUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

export function RandomTestingPool() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const drawPageSize = 5;
  const selectionPageSize = 12;
  const [drawPage, setDrawPage] = useState(1);
  const [selectionPage, setSelectionPage] = useState(1);
  useEffect(() => {
    setDrawPage(1);
    setSelectionPage(1);
  }, [companyId]);

  const poolQ = useQuery({
    queryKey: ["compliance", "drug-alcohol", "pool", companyId],
    enabled: Boolean(companyId),
    queryFn: () => apiGet(`/api/v1/compliance/drug-alcohol/pool?operating_company_id=${encodeURIComponent(companyId)}`),
  });

  const drawsQ = useQuery({
    queryKey: ["compliance", "drug-alcohol", "draws", companyId, drawPage, selectionPage],
    enabled: Boolean(companyId),
    queryFn: () => apiGet(`/api/v1/compliance/drug-alcohol/draws?operating_company_id=${encodeURIComponent(companyId)}&draw_limit=${drawPageSize}&draw_offset=${(drawPage - 1) * drawPageSize}&selection_limit=${selectionPageSize}&selection_offset=${(selectionPage - 1) * selectionPageSize}`),
  });

  const members = (poolQ.data as { members?: Array<Record<string, unknown>> })?.members ?? [];
  const draws = (drawsQ.data as { draws?: Array<Record<string, unknown>> })?.draws ?? [];
  const selections = (drawsQ.data as { selections?: Array<Record<string, unknown>> })?.selections ?? [];
  const drawTotal = Number((drawsQ.data as { draw_total_count?: number })?.draw_total_count ?? draws.length);
  const selectionTotal = Number((drawsQ.data as { selection_total_count?: number })?.selection_total_count ?? selections.length);
  const drawPageCount = Math.max(1, Math.ceil(drawTotal / drawPageSize));
  const selectionPageCount = Math.max(1, Math.ceil(selectionTotal / selectionPageSize));
  useEffect(() => {
    if (drawPage > drawPageCount) setDrawPage(drawPageCount);
  }, [drawPage, drawPageCount]);
  useEffect(() => {
    if (selectionPage > selectionPageCount) setSelectionPage(selectionPageCount);
  }, [selectionPage, selectionPageCount]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs">
        <h3 className="text-sm font-semibold text-slate-900">Active pool ({members.length})</h3>
        {poolQ.isError ? (
          <div data-testid="random-testing-pool-error"><ListErrorState status={0} message={userFacingApiError(poolQ.error, "Could not load the random testing pool.")} onRetry={() => void poolQ.refetch()} /></div>
        ) : (
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {members.map((member) => (
              <li key={String(member.driver_id)} className="flex justify-between border-b border-gray-100 py-1">
                <EntityLink
                  kind="driver"
                  id={member.driver_id ? String(member.driver_id) : undefined}
                  label={entityLabel(member.driver_name, member.driver_id ? String(member.driver_id) : undefined, "Driver")}
                />
                <span>{formatDateUS(member.added_at)}</span>
              </li>
            ))}
            {members.length === 0 ? <li className="text-slate-500">No active CDL drivers in pool.</li> : null}
          </ul>
        )}
      </div>
      <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs">
        <h3 className="text-sm font-semibold text-slate-900">Recent draws & selections</h3>
        {drawsQ.isError ? (
          <div data-testid="random-testing-draws-error"><ListErrorState status={0} message={userFacingApiError(drawsQ.error, "Could not load random testing draws.")} onRetry={() => void drawsQ.refetch()} /></div>
        ) : (
          <>
            <ul className="mt-2 space-y-1">
              {draws.map((draw) => (
                <li key={String(draw.id)} className="border-b border-gray-100 py-1">
                  Q{String(draw.quarter)} {String(draw.year)} — drug {String(draw.drug_count)} / alcohol{" "}
                  {String(draw.alcohol_count)}
                </li>
              ))}
              {draws.length === 0 ? <li className="text-slate-500">No draws yet.</li> : null}
            </ul>
            <div className="mt-2 flex items-center justify-end gap-2" data-testid="random-draws-server-pager">
              <Button size="sm" variant="secondary" disabled={drawPage <= 1 || drawsQ.isFetching} onClick={() => setDrawPage((page) => Math.max(1, page - 1))}>Previous draws</Button>
              <span>Page {drawPage} of {drawPageCount} · {drawTotal} draws</span>
              <Button size="sm" variant="secondary" disabled={drawPage >= drawPageCount || drawsQ.isFetching} onClick={() => setDrawPage((page) => Math.min(drawPageCount, page + 1))}>Next draws</Button>
            </div>
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
              {selections.map((sel) => (
                <li key={String(sel.id)} className="flex justify-between border-b border-gray-50 py-0.5">
                  <EntityLink
                    kind="driver"
                    id={sel.driver_id ? String(sel.driver_id) : undefined}
                    label={entityLabel(sel.driver_name, sel.driver_id ? String(sel.driver_id) : undefined, "Driver")}
                  />
                  <span>{String(sel.test_type)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-end gap-2" data-testid="random-selections-server-pager">
              <Button size="sm" variant="secondary" disabled={selectionPage <= 1 || drawsQ.isFetching} onClick={() => setSelectionPage((page) => Math.max(1, page - 1))}>Previous selections</Button>
              <span>Page {selectionPage} of {selectionPageCount} · {selectionTotal} selections</span>
              <Button size="sm" variant="secondary" disabled={selectionPage >= selectionPageCount || drawsQ.isFetching} onClick={() => setSelectionPage((page) => Math.min(selectionPageCount, page + 1))}>Next selections</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

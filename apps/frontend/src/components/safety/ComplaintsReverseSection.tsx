import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getComplaints } from "../../api/safety";
import { useAuth } from "../../auth/useAuth";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../shared/ListErrorBanner";
import { Button } from "../Button";

type Props = {
  operatingCompanyId: string;
  // E-28 (owner order 2026-10-01): load -> complaints and unit -> complaints, the reverse half of
  // the load/truck linkage added to the complaint create form.
  // ORDERS DRIVER PROFILE: driver_id (complainant OR respondent — server SAF-F16).
  filter:
    | { customer_id: string }
    | { user_id: string }
    | { load_id: string }
    | { unit_id: string }
    | { driver_id: string };
  contextLabel: string;
  "data-testid"?: string;
};

function entityIdFromFilter(filter: Props["filter"]): string {
  if ("customer_id" in filter) return filter.customer_id;
  if ("user_id" in filter) return filter.user_id;
  if ("load_id" in filter) return filter.load_id;
  if ("driver_id" in filter) return filter.driver_id;
  return filter.unit_id;
}

export function ComplaintsReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "complaints-reverse-section",
}: Props) {
  const { user } = useAuth();
  const canView = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Safety";
  const entityId = entityIdFromFilter(filter);
  const pageSize = 25;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [operatingCompanyId, entityId]);
  const query = useQuery({
    queryKey: ["safety", "complaints", "reverse", operatingCompanyId, filter, page],
    queryFn: () => getComplaints(operatingCompanyId, { ...filter, limit: pageSize, offset: (page - 1) * pageSize }),
    enabled: canView && Boolean(operatingCompanyId) && Boolean(entityId),
  });

  if (!canView) return null;
  const rows = query.isError ? [] : query.data?.complaints ?? [];
  const total = query.isError ? 0 : query.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <h2 className="text-xs font-semibold text-[#0F1219]">Complaints{total ? ` (${total})` : ""}</h2>
      {query.isError ? (
        <ListErrorBanner message={`Couldn't load complaints for ${contextLabel}.`} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <p className="text-xs text-gray-500">No complaints linked to {contextLabel}.</p>
      ) : null}
      {rows.map((row) => (
        <div key={String(row.id)} className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs">
          <EntityLinkOrTombstone
            kind="complaint"
            id={row.id == null ? null : String(row.id)}
            name={row.summary}
            noun="Complaint"
          />
          <span className="shrink-0 text-gray-500">
            {formatDateUS(row.filed_at ? String(row.filed_at) : null)} · {String(row.status ?? "open")}
          </span>
        </div>
      ))}
      {!query.isError && total > pageSize ? (
        <div className="flex items-center justify-end gap-2 text-xs" data-testid="complaints-reverse-server-pager">
          <Button size="sm" variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous complaints</Button>
          <span className="text-[#4B5563]">Page {page} of {pageCount} · {total} complaints</span>
          <Button size="sm" variant="secondary" disabled={page >= pageCount || query.isFetching} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next complaints</Button>
        </div>
      ) : null}
    </section>
  );
}

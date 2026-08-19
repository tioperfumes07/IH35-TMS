import { useQuery } from "@tanstack/react-query";
import { getComplaints } from "../../api/safety";
import { useAuth } from "../../auth/useAuth";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../shared/ListErrorBanner";

type Props = {
  operatingCompanyId: string;
  filter: { customer_id: string } | { user_id: string };
  contextLabel: string;
  "data-testid"?: string;
};

export function ComplaintsReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "complaints-reverse-section",
}: Props) {
  const { user } = useAuth();
  const canView = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Safety";
  const entityId = "customer_id" in filter ? filter.customer_id : filter.user_id;
  const query = useQuery({
    queryKey: ["safety", "complaints", "reverse", operatingCompanyId, filter],
    queryFn: () => getComplaints(operatingCompanyId, filter),
    enabled: canView && Boolean(operatingCompanyId) && Boolean(entityId),
  });

  if (!canView) return null;
  const rows = query.data?.complaints ?? [];

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <h2 className="text-sm font-semibold text-slate-900">Complaints</h2>
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
    </section>
  );
}

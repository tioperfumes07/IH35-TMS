import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { Link } from "react-router-dom";
import { EntityLink } from "../shared/EntityLink";
import { listLoadTemplates } from "../../api/dispatch";

export function CustomerLoadTemplatesReverseSection({ operatingCompanyId, customerId }: { operatingCompanyId: string; customerId: string }) {
  const query = useQuery({
    queryKey: ["load-templates", "customer-profile", operatingCompanyId, customerId],
    queryFn: () => listLoadTemplates(operatingCompanyId, { customer_id: customerId }),
    enabled: Boolean(operatingCompanyId && customerId),
  });
  const templates = query.data?.templates ?? [];
  const total = query.data?.total ?? templates.length;
  const preview = templates.slice(0, 5);
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="customer-load-templates-reverse">
      <h2 className="text-sm font-semibold text-slate-900">Load templates</h2>
      {query.isError ? <ListErrorState status={0} message="Load templates unavailable." onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && templates.length === 0 ? <p className="mt-2 text-xs text-gray-500">No load templates for this customer.</p> : null}
      <ul className="mt-2 space-y-1">
        {preview.map((template) => (
          <li key={template.id}>
            <EntityLink
              kind="load_template"
              id={template.id}
              label={template.name}
              className="text-xs font-semibold text-slate-700 hover:underline"
            />
          </li>
        ))}
      </ul>
      {!query.isLoading && !query.isError && total > 0 ? (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
          <span>Showing {preview.length} of {total}</span>
          {total > preview.length ? (
            <Link className="font-semibold text-slate-700 underline" to={`/dispatch/planner?panel=templates&customer_id=${encodeURIComponent(customerId)}`}>
              Open all {total}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../shared/EntityLink";
import { listLoadTemplates } from "../../api/dispatch";

export function CustomerLoadTemplatesReverseSection({ operatingCompanyId, customerId }: { operatingCompanyId: string; customerId: string }) {
  const query = useQuery({
    queryKey: ["load-templates", "customer-profile", operatingCompanyId, customerId],
    queryFn: () => listLoadTemplates(operatingCompanyId, { customer_id: customerId }),
    enabled: Boolean(operatingCompanyId && customerId),
  });
  const templates = query.data?.templates ?? [];
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="customer-load-templates-reverse">
      <h2 className="text-sm font-semibold text-slate-900">Load templates</h2>
      {query.isError ? <p className="mt-2 text-xs text-red-700">Load templates unavailable.</p> : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && templates.length === 0 ? <p className="mt-2 text-xs text-gray-500">No load templates for this customer.</p> : null}
      <ul className="mt-2 space-y-1">
        {templates.slice(0, 5).map((template) => (
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
    </section>
  );
}

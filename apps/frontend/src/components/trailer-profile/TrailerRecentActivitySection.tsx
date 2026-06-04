import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { listFiles, type DocsFile } from "../../api/docs";

type Props = {
  equipmentId: string;
  companyId: string;
};

export function TrailerRecentActivitySection({ equipmentId, companyId }: Props) {
  const logQ = useQuery({
    queryKey: ["trailer-equipment-log", equipmentId],
    queryFn: () =>
      apiRequest<{ equipment_log: Array<Record<string, unknown>> }>(
        `/api/v1/mdata/equipment-log?equipment_id=${encodeURIComponent(equipmentId)}&limit=10`
      ),
    enabled: Boolean(equipmentId),
  });

  const docsQ = useQuery({
    queryKey: ["trailer-docs", equipmentId, companyId],
    queryFn: () =>
      listFiles({
        entity_type: "equipment",
        entity_id: equipmentId,
        limit: 10,
      }),
    enabled: Boolean(equipmentId && companyId),
  });

  const woQ = useQuery({
    queryKey: ["trailer-work-orders", equipmentId, companyId],
    queryFn: () =>
      apiRequest<{ work_orders: Array<Record<string, unknown>>; total_count: number }>(
        `/api/v1/maintenance/work-orders?operating_company_id=${encodeURIComponent(companyId)}&equipment_id=${encodeURIComponent(equipmentId)}&limit=10`
      ),
    enabled: Boolean(equipmentId && companyId),
  });

  const logRows = logQ.data?.equipment_log ?? [];
  const docRows = docsQ.data?.files ?? [];
  const woRows = woQ.data?.work_orders ?? [];

  return (
    <section className="rounded border border-gray-200 bg-white p-4" data-testid="tp-section-9-activity">
      <h2 className="text-sm font-semibold text-gray-800">Recent activity</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <div>
          <h3 className="text-xs font-medium text-gray-600">Equipment log</h3>
          <ul className="mt-1 space-y-1 text-xs text-gray-800">
            {logRows.length === 0 ? <li className="text-gray-500">No log events.</li> : null}
            {logRows.map((r) => (
              <li key={String(r.id)}>
                {String(r.event_type)} · {String(r.event_at ?? "").slice(0, 10)}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-medium text-gray-600">Documents</h3>
          <ul className="mt-1 space-y-1 text-xs text-gray-800">
            {docRows.length === 0 ? <li className="text-gray-500">No files.</li> : null}
            {docRows.map((f: DocsFile) => (
              <li key={f.id}>{f.original_filename ?? f.id}</li>
            ))}
          </ul>
        </div>
        <div data-testid="tp-trailer-work-orders">
          <h3 className="text-xs font-medium text-gray-600">Work orders</h3>
          <ul className="mt-1 space-y-1 text-xs text-gray-800">
            {woRows.length === 0 ? <li className="text-gray-500">No work orders.</li> : null}
            {woRows.map((w) => (
              <li key={String(w.id)}>
                {String(w.display_id ?? w.id)} · {String(w.status ?? "—")}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

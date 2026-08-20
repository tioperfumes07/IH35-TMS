import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { getDriverHosDetail } from "../../api/hos";
import { getDriver } from "../../api/mdata";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateTimeUS } from "../../lib/formatDate";
import { titleize } from "../../lib/titleize";
import { formatQueryErrorDetail } from "../../lib/tableError";

function minutesToLabel(minutes: number) {
  const safe = Math.max(0, Math.floor(minutes));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hrs}h ${mins}m`;
}

function statusClass(status: "ok" | "warning_1hr" | "warning_15min" | "violation") {
  if (status === "violation") return "bg-red-100 text-red-700";
  if (status === "warning_15min" || status === "warning_1hr") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

export function DriverHosDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";

  const driverQuery = useQuery({
    queryKey: ["driver", id, operatingCompanyId, "hos-detail-header"],
    queryFn: () => getDriver(id, operatingCompanyId),
    enabled: Boolean(id && operatingCompanyId),
  });

  const hosQuery = useQuery({
    queryKey: ["driver-hos-detail", operatingCompanyId, id],
    queryFn: () => getDriverHosDetail(id, operatingCompanyId),
    enabled: Boolean(id && operatingCompanyId),
    refetchInterval: 60_000,
  });
  const driverName = driverQuery.data
    ? [driverQuery.data.first_name, driverQuery.data.last_name].filter(Boolean).join(" ").trim() || null
    : null;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Driver HOS Detail"
        subtitle={driverQuery.data ? `${driverQuery.data.first_name} ${driverQuery.data.last_name}` : "Driver timeline and FMCSA clocks"}
        actions={
          id ? (
            <EntityLinkOrTombstone
              kind="driver"
              id={id}
              name={driverName}
              noun="Driver"
              className="rounded-sm border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"
              data-testid="driver-hos-detail-back-driver-link"
            />
          ) : null
        }
      />

      {!operatingCompanyId ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700">
          Select an operating company to view HOS details.
        </div>
      ) : null}

      {hosQuery.data ? (
        <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase text-gray-500">11hr drive</div>
              <div className="text-lg font-semibold">{minutesToLabel(hosQuery.data.clocks.drive_remaining_min)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase text-gray-500">14hr window</div>
              <div className="text-lg font-semibold">{minutesToLabel(hosQuery.data.clocks.window_remaining_min)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase text-gray-500">30m break</div>
              <div className="text-lg font-semibold">{minutesToLabel(hosQuery.data.clocks.break_remaining_min)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase text-gray-500">70hr cycle</div>
              <div className="text-lg font-semibold">{minutesToLabel(hosQuery.data.clocks.cycle_remaining_min)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase text-gray-500">Status</div>
              <div className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(hosQuery.data.clocks.status)}`}>
                {titleize(hosQuery.data.clocks.status)}
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-gray-900">24-hour duty status timeline</h2>
            <div className="mt-2 space-y-1">
              {hosQuery.data.timeline_24h.map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-100 bg-gray-50 px-2 py-1 text-xs">
                  <span className="font-semibold">{event.duty_status}</span>
                  <span>{formatDateTimeUS(event.started_at)} CT → {event.ended_at ? `${formatDateTimeUS(event.ended_at)} CT` : "open"}</span>
                  <span className="text-gray-500">{event.location ?? "location n/a"}</span>
                  <EntityLinkOrTombstone
                    kind="unit"
                    id={event.unit_id}
                    name={event.unit_number}
                    noun="Unit"
                    data-testid={`driver-hos-event-unit-${event.id}`}
                  />
                </div>
              ))}
              {hosQuery.data.timeline_24h.length === 0 ? <div className="text-xs text-gray-500">No duty status events in the last 24 hours.</div> : null}
            </div>
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-gray-900">Last 8 days summary</h2>
            <div className="mt-2 space-y-1">
              {hosQuery.data.summary_8d.map((row) => (
                <div key={`${row.service_day}-${row.duty_status}`} className="flex items-center justify-between rounded-sm border border-gray-100 bg-gray-50 px-2 py-1 text-xs">
                  <span>{row.service_day} · {row.duty_status}</span>
                  <span>{minutesToLabel(Number(row.total_minutes ?? 0))}</span>
                </div>
              ))}
              {hosQuery.data.summary_8d.length === 0 ? <div className="text-xs text-gray-500">No HOS usage in the last 8 days.</div> : null}
            </div>
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-gray-900">Manual edit audit</h2>
            <p className="mt-1 text-xs text-gray-600">
              Manual edits require supervisor sign-off. Current count: {hosQuery.data.manual_edits.count}
            </p>
            {hosQuery.data.manual_edits.count === 0 ? (
              <p className="mt-2 text-xs text-gray-500">No manual edits recorded.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {hosQuery.data.manual_edits.events.map((event) => (
                  <div key={event.id} className="rounded-sm border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-800">
                    {formatDateTimeUS(event.started_at)} CT · {event.duty_status}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}

      {hosQuery.isLoading ? <div className="text-sm text-gray-500">Loading HOS details...</div> : null}
      {hosQuery.isError ? (
        <ListErrorState
          title="Couldn't load HOS details"
          {...formatQueryErrorDetail(hosQuery.error)}
          onRetry={() => void hosQuery.refetch()}
        />
      ) : null}
    </div>
  );
}

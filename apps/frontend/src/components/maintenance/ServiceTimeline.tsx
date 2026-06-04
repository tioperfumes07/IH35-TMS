import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  getMaintenanceServiceTimeline,
  type ServiceTimelineEvent,
  type ServiceTimelineEventType,
} from "../../api/maintenance";

const EVENT_TYPE_OPTIONS: Array<{ value: ServiceTimelineEventType; label: string }> = [
  { value: "work_order", label: "Work orders" },
  { value: "inspection", label: "Inspections" },
  { value: "pm", label: "PM" },
  { value: "fuel", label: "Fuel" },
  { value: "accident", label: "Accidents" },
];

type Props = {
  companyId: string;
  unitId?: string;
  equipmentId?: string;
  /** When false, hides unit-only filters on trailer profiles. */
  showUnitEventTypes?: boolean;
};

export function ServiceTimeline({ companyId, unitId, equipmentId, showUnitEventTypes = true }: Props) {
  const navigate = useNavigate();
  const [selectedTypes, setSelectedTypes] = useState<ServiceTimelineEventType[]>(
    showUnitEventTypes
      ? EVENT_TYPE_OPTIONS.map((opt) => opt.value)
      : EVENT_TYPE_OPTIONS.filter((opt) => opt.value === "work_order").map((opt) => opt.value)
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const visibleTypeOptions = useMemo(
    () => (showUnitEventTypes ? EVENT_TYPE_OPTIONS : EVENT_TYPE_OPTIONS.filter((opt) => opt.value === "work_order")),
    [showUnitEventTypes]
  );

  const timelineQ = useQuery({
    queryKey: ["service-timeline", companyId, unitId, equipmentId, selectedTypes, fromDate, toDate],
    queryFn: () =>
      getMaintenanceServiceTimeline({
        operating_company_id: companyId,
        unit_id: unitId,
        equipment_id: equipmentId,
        event_types: selectedTypes,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      }),
    enabled: Boolean(companyId && (unitId || equipmentId)),
  });

  const events = timelineQ.data?.events ?? [];

  const toggleType = (value: ServiceTimelineEventType) => {
    setSelectedTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const openEvent = (event: ServiceTimelineEvent) => {
    navigate(event.detail_path);
  };

  return (
    <section className="rounded border border-gray-200 bg-white p-4" data-testid="service-timeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Service history</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="text-gray-600">
            From
            <input
              type="date"
              className="ml-1 rounded border border-gray-300 px-1 py-0.5"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              data-testid="service-timeline-from-date"
            />
          </label>
          <label className="text-gray-600">
            To
            <input
              type="date"
              className="ml-1 rounded border border-gray-300 px-1 py-0.5"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-testid="service-timeline-to-date"
            />
          </label>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2" data-testid="service-timeline-type-filters">
        {visibleTypeOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`rounded px-2 py-1 text-xs ${
              selectedTypes.includes(opt.value) ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700"
            }`}
            onClick={() => toggleType(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {timelineQ.isLoading ? <p className="mt-3 text-xs text-gray-500">Loading service history…</p> : null}
      {timelineQ.isError ? (
        <p className="mt-3 text-xs text-red-600">Unable to load service history.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {events.length === 0 ? (
            <li className="text-xs text-gray-500">No service events for the selected filters.</li>
          ) : (
            events.map((event) => (
              <li key={`${event.event_type}-${event.id}`} className="border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                <button
                  type="button"
                  className="w-full text-left"
                  data-testid={`service-timeline-event-${event.event_type}-${event.id}`}
                  onClick={() => openEvent(event)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-900">{event.title}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">{event.event_type.replace(/_/g, " ")}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                    <span>{event.occurred_at.slice(0, 10)}</span>
                    {event.status ? <span>{event.status}</span> : null}
                    {event.subtitle ? <span className="truncate">{event.subtitle}</span> : null}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
}

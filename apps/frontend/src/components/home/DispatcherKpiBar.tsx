import { Link } from "react-router-dom";

type DispatcherKpiBarProps = {
  // GO-0027-HOME-F: null (not a fabricated 0) is how a failed fetch is represented -- matches
  // the C8 "honest KPI" contract (DrillKpiCard/SafetyKpiBar) elsewhere in this codebase.
  activeLoads: number | null;
  lateLoads: number | null;
  todayPickups: number | null;
  todayDeliveries: number | null;
};

type KpiCard = {
  label: string;
  value: number | null;
  to: string;
};

export function DispatcherKpiBar({ activeLoads, lateLoads, todayPickups, todayDeliveries }: DispatcherKpiBarProps) {
  const cards: KpiCard[] = [
    { label: "Active loads", value: activeLoads, to: "/dispatch?view=loads" },
    { label: "Late loads", value: lateLoads, to: "/dispatch?view=loads" },
    { label: "Today's pickups", value: todayPickups, to: "/dispatch?view=loads" },
    { label: "Today's deliveries", value: todayDeliveries, to: "/dispatch?view=loads" },
  ];

  return (
    <section
      data-testid="dispatcher-kpi-bar"
      className="overflow-hidden rounded-sm border border-[#E5E7EB] bg-white"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-[#E5E7EB]">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            aria-label={`${card.label} — view loads`}
            className="block border-t border-[#E5E7EB] px-3 py-2 text-[#0F1219] transition hover:bg-[#F7F8FA] focus:outline-hidden focus:ring-2 focus:ring-[#6B7280]"
          >
            <div className="text-section-header font-semibold uppercase tracking-wide text-[#4B5563]">{card.label}</div>
            <div className="mt-1 text-page-title font-semibold">{card.value ?? "—"}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

import { Link } from "react-router-dom";

type DispatcherKpiBarProps = {
  activeLoads: number;
  lateLoads: number;
  todayPickups: number;
  todayDeliveries: number;
};

type KpiCard = {
  label: string;
  value: number;
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
      className="overflow-hidden rounded-sm border border-slate-200 bg-white"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-slate-100">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            aria-label={`${card.label} — view loads`}
            className="block border-t border-slate-100 px-3 py-2 text-slate-900 transition hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-400"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold">{card.value}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

type DispatcherKpiBarProps = {
  activeLoads: number;
  lateLoads: number;
  todayPickups: number;
  todayDeliveries: number;
};

type KpiCard = {
  label: string;
  value: number;
  accent: "blue" | "red" | "emerald";
};

function cardClasses(accent: KpiCard["accent"]) {
  if (accent === "red") {
    return "border-red-200 bg-red-50 text-red-900";
  }
  if (accent === "emerald") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  return "border-blue-200 bg-blue-50 text-blue-900";
}

export function DispatcherKpiBar({ activeLoads, lateLoads, todayPickups, todayDeliveries }: DispatcherKpiBarProps) {
  const cards: KpiCard[] = [
    { label: "Active loads", value: activeLoads, accent: "blue" },
    { label: "Late loads", value: lateLoads, accent: lateLoads > 0 ? "red" : "emerald" },
    { label: "Today's pickups", value: todayPickups, accent: "blue" },
    { label: "Today's deliveries", value: todayDeliveries, accent: "blue" },
  ];

  return (
    <section data-testid="dispatcher-kpi-bar" className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className={`rounded border px-3 py-2 ${cardClasses(card.accent)}`}>
          <div className="text-[11px] font-semibold uppercase tracking-wide">{card.label}</div>
          <div className="mt-1 text-2xl font-semibold">{card.value}</div>
        </article>
      ))}
    </section>
  );
}

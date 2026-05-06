type Props = {
  kpis: Record<string, unknown> | undefined;
};

export function LiabilitiesKpiRow({ kpis }: Props) {
  const cards = [
    ["Total Active Debt", Number(kpis?.total_active_debt ?? 0)],
    ["Drivers w/ Debt", Number(kpis?.drivers_with_debt ?? 0)],
    ["Pending Acks", Number(kpis?.pending_acks ?? 0)],
    ["Equipment Loss YTD", Number(kpis?.equipment_loss_ytd ?? 0)],
    ["Civil Fines YTD", Number(kpis?.civil_fines_ytd ?? 0)],
    ["Avg Time to Pay-Off (days)", Number(kpis?.avg_days_to_payoff ?? 0)],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {cards.map(([label, value], idx) => (
        <div key={label} className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
          <div className="text-[10px] uppercase text-gray-500">{label}</div>
          <div className={`font-semibold ${idx === 2 ? "text-amber-700" : ""}`}>{idx < 2 || idx === 5 ? value : `$${value.toFixed(2)}`}</div>
        </div>
      ))}
    </div>
  );
}

type Props = {
  kpis: Record<string, unknown> | undefined;
};

export function SafetyKpiRow({ kpis }: Props) {
  const cards = [
    ["Open Events", Number(kpis?.open_events ?? 0)],
    ["Pending Acks", Number(kpis?.pending_acks ?? 0)],
    ["MTD Violations", Number(kpis?.mtd_violations ?? 0)],
    ["Training Due (30d)", Number(kpis?.training_due_30d ?? 0)],
    ["D/A Tests YTD", Number(kpis?.da_tests_ytd ?? 0)],
    ["CSA Score", Number(kpis?.csa_score_latest ?? 0)],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
          <div className="text-[10px] uppercase text-gray-500">{label}</div>
          <div className="font-semibold text-gray-900">{value}</div>
        </div>
      ))}
    </div>
  );
}

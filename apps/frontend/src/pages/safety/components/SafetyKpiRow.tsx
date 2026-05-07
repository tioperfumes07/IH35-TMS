type Props = {
  kpis: Record<string, unknown> | undefined;
};

export function SafetyKpiRow({ kpis }: Props) {
  const cards = [
    ["Active Drivers", Number(kpis?.active_drivers ?? 0)],
    ["Drivers with Open Fines", Number(kpis?.drivers_with_open_fines ?? 0)],
    ["Open Company Violations", Number(kpis?.open_company_violations ?? 0)],
    ["Critical Integrity Alerts", Number(kpis?.critical_integrity_alerts ?? 0)],
    ["Pending Acknowledgments", Number(kpis?.pending_acknowledgments ?? kpis?.pending_acks ?? 0)],
    ["Open Liabilities", Number(kpis?.open_liabilities ?? 0)],
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

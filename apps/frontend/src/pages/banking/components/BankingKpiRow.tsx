type Props = {
  kpis: Record<string, unknown> | undefined;
};

export function BankingKpiRow({ kpis }: Props) {
  const cards = [
    ["Total Cash", Number(kpis?.total_cash ?? 0)],
    ["DIP Operating", Number(kpis?.dip_operating ?? 0)],
    ["DIP Payroll", Number(kpis?.dip_payroll ?? 0)],
    ["Factoring Reserve", Number(kpis?.factoring_reserve ?? 0)],
    ["Driver Escrow", Number(kpis?.driver_escrow ?? 0)],
    ["Uncategorized", Number(kpis?.total_uncategorized ?? 0)],
    ["Pending Bills", Number(kpis?.pending_bills ?? 0)],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      {cards.map(([label, value], idx) => (
        <div key={label} className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
          <div className="text-[10px] uppercase text-gray-500">{label}</div>
          <div className={`font-semibold ${idx === 5 ? "text-amber-700" : ""}`}>
            {label === "Uncategorized" || label === "Pending Bills" ? value : `$${value.toFixed(2)}`}
          </div>
        </div>
      ))}
    </div>
  );
}

type Props = {
  kpis?: Record<string, unknown>;
};

function money(value: unknown) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export function CashAdvancesKpiRow({ kpis }: Props) {
  return (
    <div className="grid gap-2 md:grid-cols-5">
      <div className="rounded border border-gray-200 bg-white p-2 text-xs">
        <div className="text-gray-500">Total Outstanding</div>
        <div className="mt-1 text-base font-semibold">{money(kpis?.total_outstanding)}</div>
      </div>
      <div className="rounded border border-gray-200 bg-white p-2 text-xs">
        <div className="text-gray-500">MTD Disbursed</div>
        <div className="mt-1 text-base font-semibold">{money(kpis?.mtd_disbursed)}</div>
      </div>
      <div className="rounded border border-gray-200 bg-white p-2 text-xs">
        <div className="text-gray-500">Pending Approval</div>
        <div className="mt-1 text-base font-semibold">{Number(kpis?.pending_approval ?? 0)}</div>
      </div>
      <div className="rounded border border-gray-200 bg-white p-2 text-xs">
        <div className="text-gray-500">Avg Per Advance</div>
        <div className="mt-1 text-base font-semibold">{money(kpis?.avg_per_advance)}</div>
      </div>
      <div className="rounded border border-gray-200 bg-white p-2 text-xs">
        <div className="text-gray-500">Drivers w/ Active Advance</div>
        <div className="mt-1 text-base font-semibold">{Number(kpis?.drivers_with_active ?? 0)}</div>
      </div>
    </div>
  );
}

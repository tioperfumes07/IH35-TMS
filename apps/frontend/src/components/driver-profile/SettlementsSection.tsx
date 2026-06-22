function cents(n: unknown) {
  const v = Number(n ?? 0);
  return `$${(v / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SettlementsSection({
  settlements,
  driverId,
  autoPayEnabled = false,
  autoPaySaving = false,
  onAutoPayChange,
}: {
  settlements: Record<string, unknown>;
  driverId: string;
  autoPayEnabled?: boolean;
  autoPaySaving?: boolean;
  onAutoPayChange?: (enabled: boolean) => void;
}) {
  const weeks = (settlements.last_4_weeks as Array<Record<string, unknown>>) ?? [];
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Settlements</h2>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={autoPayEnabled} disabled={!onAutoPayChange || autoPaySaving} onChange={(e) => onAutoPayChange?.(e.target.checked)} />
          Auto-pay on payday
        </label>
        <a href={`/settlements?driver_id=${driverId}`} className="text-xs text-slate-700 underline">
          Full settlements
        </a>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded border border-gray-100 p-2">
          <div className="text-[10px] uppercase text-gray-500">YTD gross</div>
          <div className="font-semibold">{cents(settlements.ytd_gross)}</div>
        </div>
        <div className="rounded border border-gray-100 p-2">
          <div className="text-[10px] uppercase text-gray-500">YTD deductions</div>
          <div className="font-semibold">{cents(settlements.ytd_deductions)}</div>
        </div>
        <div className="rounded border border-gray-100 p-2">
          <div className="text-[10px] uppercase text-gray-500">YTD net</div>
          <div className="font-semibold">{cents(settlements.ytd_net)}</div>
        </div>
        <div className="rounded border border-gray-100 p-2">
          <div className="text-[10px] uppercase text-gray-500">Lifetime net</div>
          <div className="font-semibold">{cents(settlements.lifetime_with_company)}</div>
        </div>
      </div>
      <table className="mt-3 w-full text-left text-xs">
        <thead>
          <tr className="text-gray-500">
            <th>Week ending</th>
            <th>Gross</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {weeks.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-2 text-gray-500">
                No recent settlements.
              </td>
            </tr>
          ) : (
            weeks.map((w) => (
              <tr key={String(w.week_ending)} className="border-t border-gray-100">
                <td className="py-1">{String(w.week_ending ?? "—")}</td>
                <td>{cents(w.gross)}</td>
                <td>{cents(w.net)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

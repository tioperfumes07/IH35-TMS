type Props = { loadId: string; operatingCompanyId: string; canEdit: boolean };

/** Stub — settlement profitability breakdown delivered by Lane B Block 9 (DISP-PROFITABILITY). */
export function SettlementProfitabilityCard({ loadId }: Props) {
  return (
    <div className="rounded-sm border border-dashed border-slate-200 bg-slate-100 p-3 text-sm text-slate-700" data-testid="drawer-profitability-card-stub">
      Trip profitability breakdown — content ships in Block 9 (load{" "}
      <span className="font-mono text-xs">{loadId.slice(0, 8)}</span>).
    </div>
  );
}

/** REG-010/011: settlement identity is allocated by the server and cannot be overwritten. */
export function SettlementNumberBox({ displayId }: { displayId: string | null }) {
  return (
    <div data-testid="settlement-number-box">
      <div className="text-[11px] font-bold uppercase text-[#4B5563]">Settlement/Tour</div>
      <div className="text-xs font-semibold" data-testid="settlement-number-box-frozen">
        {displayId ?? "—"}
      </div>
    </div>
  );
}

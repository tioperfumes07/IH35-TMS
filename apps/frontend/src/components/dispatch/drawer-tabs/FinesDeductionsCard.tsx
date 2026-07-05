type Props = { loadId: string; operatingCompanyId: string; canEdit: boolean };

/** Stub — fines & deductions confirm/defer UI delivered by Lane A Block 13 (DISP-FINES-DEDUCT). */
export function FinesDeductionsCard({ loadId, canEdit }: Props) {
  return (
    <div className="rounded-sm border border-dashed border-slate-200 bg-slate-100 p-3 text-sm text-slate-700" data-testid="drawer-fines-deductions-card-stub">
      Fines &amp; deductions {canEdit ? "(confirm/defer)" : "(read-only)"} — content ships in Block 13 (load{" "}
      <span className="font-mono text-xs">{loadId.slice(0, 8)}</span>).
    </div>
  );
}

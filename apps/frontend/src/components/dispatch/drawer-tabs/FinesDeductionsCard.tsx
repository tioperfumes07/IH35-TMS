type Props = { loadId: string; operatingCompanyId: string; canEdit: boolean };

/** Stub — fines & deductions confirm/defer UI delivered by Lane A Block 13 (DISP-FINES-DEDUCT). */
export function FinesDeductionsCard({ loadId, canEdit }: Props) {
  return (
    <div className="rounded border border-dashed border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="drawer-fines-deductions-card-stub">
      Fines &amp; deductions {canEdit ? "(confirm/defer)" : "(read-only)"} — content ships in Block 13 (load{" "}
      <span className="font-mono text-xs">{loadId.slice(0, 8)}</span>).
    </div>
  );
}

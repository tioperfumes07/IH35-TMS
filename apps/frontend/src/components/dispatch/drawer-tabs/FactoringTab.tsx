type Props = { loadId: string; operatingCompanyId: string; canEdit: boolean };

/** Stub — real packet UI delivered by Lane B Block 7 (DISP-FACTORING-PACKET). */
export function FactoringTab({ loadId }: Props) {
  return (
    <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600" data-testid="drawer-factoring-tab-stub">
      Factoring packet assembly for load <span className="font-mono text-xs">{loadId.slice(0, 8)}</span> — content ships in Block 7.
    </div>
  );
}

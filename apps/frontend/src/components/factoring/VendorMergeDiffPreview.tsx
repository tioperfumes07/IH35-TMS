type Props = {
  driverName: string;
  fromVendorName: string;
  fromVendorId: string;
  toVendorName: string;
  toVendorId: string;
  mergeConfirm: string;
  onMergeConfirmChange: (value: string) => void;
};

export function VendorMergeDiffPreview({
  driverName,
  fromVendorName,
  fromVendorId,
  toVendorName,
  toVendorId,
  mergeConfirm,
  onMergeConfirmChange,
}: Props) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs" data-vendor-merge-diff-preview="true">
      <p className="font-semibold text-gray-900">Merge preview</p>
      <p className="mt-1">Driver: {driverName || "—"}</p>
      <p>From vendor: {fromVendorName || fromVendorId || "—"} ({fromVendorId || "—"})</p>
      <p>To vendor: {toVendorName || toVendorId || "—"} ({toVendorId || "—"})</p>
      <p className="mt-2 text-gray-700">After merge: transactions on the source vendor will consolidate under the target vendor.</p>
      <label className="mt-2 block">
        Type MERGE to confirm
        <input
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          value={mergeConfirm}
          onChange={(event) => onMergeConfirmChange(event.target.value)}
        />
      </label>
    </div>
  );
}

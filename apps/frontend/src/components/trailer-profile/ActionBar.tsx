const linkClass =
  "inline-flex h-8 items-center justify-center rounded border border-gray-300 bg-white px-3 text-[13px] font-medium text-gray-800";

export function ActionBar({
  equipmentId,
  companyId,
  equipmentNumber,
  onEdit,
  onChangeStatus,
}: {
  equipmentId: string;
  companyId: string;
  equipmentNumber: string;
  onEdit?: () => void;
  onChangeStatus?: () => void;
}) {
  const pdfUrl = `/api/v1/mdata/equipment/${equipmentId}/export.pdf?operating_company_id=${encodeURIComponent(companyId)}`;
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
      <button type="button" className={linkClass} onClick={onEdit} data-testid="tp-edit-button">
        Edit
      </button>
      <button type="button" className={linkClass} onClick={onChangeStatus}>
        Change Status
      </button>
      <a className={linkClass} href={`/maintenance/work-orders/new?equipment_id=${equipmentId}`}>
        + Create WO
      </a>
      <a className={linkClass} href={pdfUrl} download data-testid="tp-export-pdf">
        Export PDF
      </a>
      <button type="button" className={linkClass}>
        Archive
      </button>
      <span className="sr-only">{equipmentNumber}</span>
    </div>
  );
}

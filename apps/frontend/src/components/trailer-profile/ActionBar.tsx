import { Link } from "react-router-dom";
import { resolveApiUrl } from "../../api/client";

const linkClass =
  "inline-flex h-8 items-center justify-center rounded-sm border border-gray-300 bg-white px-3 text-[13px] font-medium text-gray-800";

export function ActionBar({
  equipmentId,
  companyId,
  equipmentNumber,
  onEdit,
  onQuickAssign,
  onChangeStatus,
  onArchive,
}: {
  equipmentId: string;
  companyId: string;
  equipmentNumber: string;
  onEdit?: () => void;
  onQuickAssign?: () => void;
  onChangeStatus?: () => void;
  onArchive?: () => void;
}) {
  const pdfUrl = resolveApiUrl(
    `/api/v1/mdata/equipment/${equipmentId}/export.pdf?operating_company_id=${encodeURIComponent(companyId)}`,
  );
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-gray-200 bg-white/95 p-3 backdrop-blur-sm">
      <button type="button" className={linkClass} onClick={onEdit} data-testid="tp-edit-button">
        Edit
      </button>
      <button type="button" className={linkClass} onClick={onQuickAssign} data-testid="tp-quick-assign-driver">
        Quick assign driver
      </button>
      <button type="button" className={linkClass} onClick={onChangeStatus}>
        Change Status
      </button>
      <Link className={linkClass} to={`/maintenance/work-orders/new?equipment_id=${equipmentId}`}>
        + Create WO
      </Link>
      <a className={linkClass} href={pdfUrl} download data-testid="tp-export-pdf">
        Export PDF
      </a>
      <button type="button" className={linkClass} onClick={onArchive}>
        Archive
      </button>
      <span className="sr-only">{equipmentNumber}</span>
    </div>
  );
}

import { Link } from "react-router-dom";
import { Button } from "../Button";
import { resolveApiUrl } from "../../api/client";

const linkClass =
  "inline-flex h-8 items-center justify-center rounded-sm border border-gray-300 bg-white px-3 text-[13px] font-medium text-gray-800";

export function ActionBar({
  unitId,
  companyId,
  unitNumber,
  onChangeStatus,
  onEdit,
  onArchive,
}: {
  unitId: string;
  companyId: string;
  unitNumber: string;
  onChangeStatus?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
}) {
  const pdfUrl = resolveApiUrl(
    `/api/v1/mdata/units/${unitId}/export.pdf?operating_company_id=${encodeURIComponent(companyId)}`,
  );

  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-gray-200 bg-white/95 p-3 backdrop-blur-sm">
      <Button size="sm" variant="secondary" onClick={onEdit}>
        Edit
      </Button>
      <Button size="sm" variant="secondary" onClick={onChangeStatus}>
        Change Status
      </Button>
      <Link
        className={linkClass}
        to={`/maintenance/work-orders/new?unit_id=${encodeURIComponent(unitId)}`}
        data-testid="vp-create-work-order"
      >
        + Create Work Order
      </Link>
      <a className={linkClass} href={`/dispatch/map?unit_id=${encodeURIComponent(unitId)}`}>
        View on Map
      </a>
      <a className={linkClass} href={pdfUrl} download data-testid="vp-export-pdf">
        Export PDF
      </a>
      <Button size="sm" variant="secondary" onClick={onArchive}>
        Archive
      </Button>
      <span className="sr-only">{unitNumber}</span>
    </div>
  );
}

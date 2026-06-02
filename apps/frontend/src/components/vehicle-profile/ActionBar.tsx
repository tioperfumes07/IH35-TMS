import { Button } from "../Button";

const linkClass =
  "inline-flex h-8 items-center justify-center rounded border border-gray-300 bg-white px-3 text-[13px] font-medium text-gray-800";

export function ActionBar({
  unitId,
  companyId,
  unitNumber,
  onChangeStatus,
}: {
  unitId: string;
  companyId: string;
  unitNumber: string;
  onChangeStatus?: () => void;
}) {
  const pdfUrl = `/api/v1/mdata/units/${unitId}/export.pdf?operating_company_id=${encodeURIComponent(companyId)}`;

  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
      <Button size="sm" variant="secondary">
        Edit
      </Button>
      <Button size="sm" variant="secondary" onClick={onChangeStatus}>
        Change Status
      </Button>
      <a className={linkClass} href={`/maintenance/work-orders/new?unit_id=${unitId}`}>
        + Create WO
      </a>
      <a className={linkClass} href={`/fleet/map?unit=${unitId}`}>
        View on Map
      </a>
      <a className={linkClass} href={pdfUrl} download data-testid="vp-export-pdf">
        Export PDF
      </a>
      <Button size="sm" variant="secondary">
        Archive
      </Button>
      <span className="sr-only">{unitNumber}</span>
    </div>
  );
}

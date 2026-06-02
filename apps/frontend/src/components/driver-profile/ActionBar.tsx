import { Button } from "../Button";

const linkClass =
  "inline-flex h-8 items-center justify-center rounded border border-gray-300 bg-white px-3 text-[13px] font-medium text-gray-800";

export function ActionBar({
  driverId,
  companyId,
  driverName,
  onSuspend,
  onTerminate,
}: {
  driverId: string;
  companyId: string;
  driverName: string;
  onSuspend?: () => void;
  onTerminate?: () => void;
}) {
  const pdfUrl = `/api/v1/mdata/drivers/${driverId}/export.pdf?operating_company_id=${encodeURIComponent(companyId)}`;

  return (
    <div
      className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-gray-200 bg-white/95 p-3 backdrop-blur"
      data-testid="dp-section-12-action-bar"
    >
      <Button size="sm" variant="secondary">
        Edit
      </Button>
      <a className={linkClass} href={`/drivers/${driverId}?assign_truck=1`}>
        Assign Truck
      </a>
      <Button size="sm" variant="secondary">
        Send Message
      </Button>
      <a className={linkClass} href={`/fleet/map?driver=${driverId}`}>
        View on Map
      </a>
      <a className={linkClass} href={pdfUrl} download data-testid="dp-export-pdf">
        Export PDF
      </a>
      <Button size="sm" variant="secondary" onClick={onSuspend}>
        Suspend
      </Button>
      <Button size="sm" variant="secondary" onClick={onTerminate}>
        Terminate
      </Button>
      <span className="sr-only">{driverName}</span>
    </div>
  );
}

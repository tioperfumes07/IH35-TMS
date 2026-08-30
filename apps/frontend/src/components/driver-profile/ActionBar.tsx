import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SendMessageModal } from "../drivers/SendMessageModal";
import { SuspendConfirmModal } from "../drivers/SuspendConfirmModal";
import { TerminateConfirmModal } from "../drivers/TerminateConfirmModal";
import { Button } from "../Button";
import { resolveApiUrl } from "../../api/client";

const linkClass =
  "inline-flex h-8 items-center justify-center rounded-sm border border-gray-300 bg-white px-3 text-[13px] font-medium text-gray-800";

export function ActionBar({
  driverId,
  companyId,
  driverName,
  driverStatus,
  onActionComplete,
  onAssignTruck,
}: {
  driverId: string;
  companyId: string;
  driverName: string;
  driverStatus?: string;
  onActionComplete?: () => void;
  onAssignTruck?: () => void;
}) {
  const navigate = useNavigate();
  const [messageOpen, setMessageOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);

  const pdfUrl = resolveApiUrl(
    `/api/v1/mdata/drivers/${driverId}/export.pdf?operating_company_id=${encodeURIComponent(companyId)}`,
  );
  const isTerminated = driverStatus === "Terminated";

  return (
    <>
      <div
        className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-gray-200 bg-white/95 p-3 backdrop-blur-sm"
        data-testid="dp-action-bar"
      >
        <Button size="sm" variant="secondary" onClick={() => navigate(`/drivers/${driverId}`)} data-testid="dp-action-edit">
          Edit
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={isTerminated || !onAssignTruck}
          title={isTerminated ? "Cannot assign truck to a terminated driver." : "Set this driver's default truck"}
          onClick={onAssignTruck}
          data-testid="dp-action-assign-truck"
        >
          Assign Truck
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setMessageOpen(true)} data-testid="dp-action-send-message">
          Send Message
        </Button>
        <a className={linkClass} href={`/dispatch/map?driver=${encodeURIComponent(driverId)}`} data-testid="dp-action-view-map">
          View on Map
        </a>
        <a className={linkClass} href={pdfUrl} download data-testid="dp-export-pdf">
          Export PDF
        </a>
        {!isTerminated ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setSuspendOpen(true)} data-testid="dp-action-suspend">
              Suspend
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setTerminateOpen(true)} data-testid="dp-action-terminate">
              Terminate
            </Button>
          </>
        ) : null}
        <span className="sr-only">{driverName}</span>
      </div>

      <SendMessageModal
        open={messageOpen}
        driverId={driverId}
        companyId={companyId}
        driverName={driverName}
        onClose={() => setMessageOpen(false)}
        onSent={onActionComplete}
      />
      <SuspendConfirmModal
        open={suspendOpen}
        driverId={driverId}
        driverName={driverName}
        onClose={() => setSuspendOpen(false)}
        onSuspended={onActionComplete}
      />
      <TerminateConfirmModal
        open={terminateOpen}
        driverId={driverId}
        driverName={driverName}
        operatingCompanyId={companyId}
        onClose={() => setTerminateOpen(false)}
        onTerminated={onActionComplete}
      />
    </>
  );
}

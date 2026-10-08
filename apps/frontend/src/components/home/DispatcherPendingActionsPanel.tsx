import { Link } from "react-router-dom";

type DispatcherPendingActionsPanelProps = {
  detentionApprovals: number;
  incomingMessageQueue: number;
  bookingGapOpen: number;
};

export function DispatcherPendingActionsPanel({
  detentionApprovals,
  incomingMessageQueue,
  bookingGapOpen,
}: DispatcherPendingActionsPanelProps) {
  return (
    <section
      data-testid="dispatcher-pending-actions-panel"
      className="overflow-hidden rounded-sm border border-[#E5E7EB] bg-white"
    >
      <div className="border-b border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#0F1219]">Pending actions</div>
      <ul className="divide-y divide-[#E5E7EB] text-xs">
        <li className="flex items-center justify-between gap-2 px-3 py-2">
          <div>
            <div className="font-semibold text-[#0F1219]">Detention approvals</div>
            <div className="text-xs text-[#4B5563]">Requests waiting for owner approval on your queue.</div>
          </div>
          <div className="text-right">
            <div className="text-page-title font-semibold text-[#0F1219]">{detentionApprovals}</div>
            <Link to="/dispatch" className="text-xs font-medium text-[#4B5563] underline">
              Open
            </Link>
          </div>
        </li>
        <li className="flex items-center justify-between gap-2 px-3 py-2">
          <div>
            <div className="font-semibold text-[#0F1219]">Message queue</div>
            <div className="text-xs text-[#4B5563]">Unread inbound driver/customer message threads.</div>
          </div>
          <div className="text-right">
            <div className="text-page-title font-semibold text-[#0F1219]">{incomingMessageQueue}</div>
            <Link to="/drivers" className="text-xs font-medium text-[#4B5563] underline">
              Open
            </Link>
          </div>
        </li>
        <li className="flex items-center justify-between gap-2 px-3 py-2">
          <div>
            <div className="font-semibold text-[#0F1219]">Booking gaps (7d)</div>
            <div className="text-xs text-[#4B5563]">Loads still not dispatched from your recent bookings.</div>
          </div>
          <div className="text-right">
            <div className="text-page-title font-semibold text-[#0F1219]">{bookingGapOpen}</div>
            <Link to="/dispatch?view=loads" className="text-xs font-medium text-[#4B5563] underline">
              Review
            </Link>
          </div>
        </li>
      </ul>
    </section>
  );
}

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
      className="overflow-hidden rounded-sm border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Pending actions</div>
      <ul className="divide-y divide-slate-100 text-sm">
        <li className="flex items-center justify-between gap-2 px-3 py-2">
          <div>
            <div className="font-semibold text-slate-900">Detention approvals</div>
            <div className="text-xs text-slate-600">Requests waiting for owner approval on your queue.</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-slate-900">{detentionApprovals}</div>
            <Link to="/dispatch" className="text-xs font-medium text-slate-700 underline">
              Open
            </Link>
          </div>
        </li>
        <li className="flex items-center justify-between gap-2 px-3 py-2">
          <div>
            <div className="font-semibold text-slate-900">Message queue</div>
            <div className="text-xs text-slate-600">Unread inbound driver/customer message threads.</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-slate-900">{incomingMessageQueue}</div>
            <Link to="/drivers" className="text-xs font-medium text-slate-700 underline">
              Open
            </Link>
          </div>
        </li>
        <li className="flex items-center justify-between gap-2 px-3 py-2">
          <div>
            <div className="font-semibold text-slate-900">Booking gaps (7d)</div>
            <div className="text-xs text-slate-600">Loads still not dispatched from your recent bookings.</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-slate-900">{bookingGapOpen}</div>
            <Link to="/dispatch?view=loads" className="text-xs font-medium text-slate-700 underline">
              Review
            </Link>
          </div>
        </li>
      </ul>
    </section>
  );
}

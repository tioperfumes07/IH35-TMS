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
    <section data-testid="dispatcher-pending-actions-panel" className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Pending actions</div>
      <ul className="space-y-2 p-3 text-sm">
        <li className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <div>
            <div className="font-semibold text-amber-900">Detention approvals</div>
            <div className="text-xs text-amber-900/80">Requests waiting for owner approval on your queue.</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-amber-900">{detentionApprovals}</div>
            <Link to="/dispatch" className="text-xs font-medium text-amber-900 underline">
              Open
            </Link>
          </div>
        </li>
        <li className="flex items-center justify-between gap-2 rounded border border-slate-300 bg-slate-100 px-3 py-2">
          <div>
            <div className="font-semibold text-slate-700">Message queue</div>
            <div className="text-xs text-slate-700/80">Unread inbound driver/customer message threads.</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-slate-700">{incomingMessageQueue}</div>
            <Link to="/drivers" className="text-xs font-medium text-slate-700 underline">
              Open
            </Link>
          </div>
        </li>
        <li className="flex items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2">
          <div>
            <div className="font-semibold text-red-900">Booking gaps (7d)</div>
            <div className="text-xs text-red-900/80">Loads still not dispatched from your recent bookings.</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-red-900">{bookingGapOpen}</div>
            <Link to="/dispatch?view=loads" className="text-xs font-medium text-red-900 underline">
              Review
            </Link>
          </div>
        </li>
      </ul>
    </section>
  );
}

type Props = {
  pendingAckCount: number;
};

export function PendingAckNotice({ pendingAckCount }: Props) {
  if (pendingAckCount <= 0) return null;
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      {pendingAckCount} liabilities require signed acknowledgment. Finalize remains locked until acknowledgments are resolved.
      <button type="button" className="ml-2 underline">Send acknowledgment requests</button>
    </div>
  );
}

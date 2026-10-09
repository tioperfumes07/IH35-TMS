type Props = {
  pendingAckCount: number;
};

export function PendingAckNotice({ pendingAckCount }: Props) {
  if (pendingAckCount <= 0) return null;
  return (
    <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#0F1219]">
      {pendingAckCount} liabilities require signed acknowledgment. Finalize remains locked until acknowledgments are resolved.
      <button type="button" className="ml-2 underline">Send acknowledgment requests</button>
    </div>
  );
}

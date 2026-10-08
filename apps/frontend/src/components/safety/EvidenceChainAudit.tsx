type CustodyEvent = {
  event_kind: string;
  user_uuid: string;
  occurred_at: string;
  sha256_at_event: string;
};

type Props = {
  events: CustodyEvent[];
};

export function EvidenceChainAudit({ events }: Props) {
  return (
    <ol className="space-y-2 border-l-2 border-[#E5E7EB] pl-3" data-testid="evidence-chain-audit">
      {events.map((event, idx) => (
        <li key={`${event.occurred_at}-${idx}`} className="relative text-xs text-[#1F2A44]">
          <span className="absolute left-[-9px] top-1 h-2 w-2 rounded-full bg-[#1F2A44]" />
          <div className="font-semibold capitalize">{event.event_kind}</div>
          <div className="text-[#6B7280]">{new Date(event.occurred_at).toLocaleString()}</div>
          <div className="font-mono text-xs text-[#6B7280]">{event.sha256_at_event.slice(0, 16)}…</div>
        </li>
      ))}
      {events.length === 0 ? <li className="text-xs text-[#6B7280]">No custody events yet.</li> : null}
    </ol>
  );
}

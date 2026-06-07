export type CustodyEventKind = "uploaded" | "viewed" | "downloaded" | "exported" | "deleted";

export type CustodyEvent = {
  event_kind: CustodyEventKind;
  user_uuid: string;
  occurred_at: string;
  details: Record<string, unknown>;
  sha256_at_event: string;
};

export function appendCustodyEvent(
  existing: CustodyEvent[],
  event: Omit<CustodyEvent, "occurred_at"> & { occurred_at?: string }
): CustodyEvent[] {
  if (event.event_kind === "deleted") {
    throw new Error("deletion_rejected");
  }
  const next: CustodyEvent = {
    ...event,
    occurred_at: event.occurred_at ?? new Date().toISOString(),
  };
  return [...existing, next];
}

export function getCustodyChain(events: CustodyEvent[]): CustodyEvent[] {
  return [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

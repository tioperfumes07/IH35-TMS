export const WF047_NOTES_PREFIX = "WF047:";

export type DualAckState = {
  pending_dropoff_ack: boolean;
  pending_pickup_ack: boolean;
  dropoff_ack_at: string | null;
  pickup_ack_at: string | null;
};

export function initialDualAckState(): DualAckState {
  return {
    pending_dropoff_ack: true,
    pending_pickup_ack: true,
    dropoff_ack_at: null,
    pickup_ack_at: null,
  };
}

export function parseDualAckNotes(notes: string | null | undefined): DualAckState | null {
  if (!notes?.startsWith(WF047_NOTES_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(WF047_NOTES_PREFIX.length)) as Partial<DualAckState>;
    return {
      pending_dropoff_ack: parsed.pending_dropoff_ack ?? !parsed.dropoff_ack_at,
      pending_pickup_ack: parsed.pending_pickup_ack ?? !parsed.pickup_ack_at,
      dropoff_ack_at: parsed.dropoff_ack_at ?? null,
      pickup_ack_at: parsed.pickup_ack_at ?? null,
    };
  } catch {
    return null;
  }
}

export function encodeDualAckNotes(userNotes: string | null | undefined, state: DualAckState): string {
  const meta = `${WF047_NOTES_PREFIX}${JSON.stringify(state)}`;
  const trimmed = userNotes?.trim();
  if (!trimmed || trimmed.startsWith(WF047_NOTES_PREFIX)) return meta;
  return `${meta}\n${trimmed}`;
}

export function stripDualAckNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const lines = notes.split("\n").filter((line) => !line.startsWith(WF047_NOTES_PREFIX));
  const joined = lines.join("\n").trim();
  return joined.length > 0 ? joined : null;
}

export function dualAckComplete(state: DualAckState | null): boolean {
  if (!state) return false;
  return Boolean(state.dropoff_ack_at && state.pickup_ack_at);
}

export function withDropoffAck(state: DualAckState): DualAckState {
  const at = new Date().toISOString();
  return {
    pending_dropoff_ack: false,
    pending_pickup_ack: !state.pickup_ack_at,
    dropoff_ack_at: at,
    pickup_ack_at: state.pickup_ack_at,
  };
}

export function withPickupAck(state: DualAckState): DualAckState {
  const at = new Date().toISOString();
  return {
    pending_dropoff_ack: !state.dropoff_ack_at,
    pending_pickup_ack: false,
    dropoff_ack_at: state.dropoff_ack_at,
    pickup_ack_at: at,
  };
}

export function enrichTransferRow<T extends Record<string, unknown>>(row: T): T & {
  dual_ack: DualAckState | null;
  dual_ack_complete: boolean;
} {
  const dual_ack = parseDualAckNotes(typeof row.notes === "string" ? row.notes : null);
  return {
    ...row,
    dual_ack,
    dual_ack_complete: dualAckComplete(dual_ack),
  };
}

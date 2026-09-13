/**
 * ALL-SEATS LAW (owner, 2026-09-13) — batches individual SettlementRefCell fetches into one
 * request per tick, so a table of N rows each rendering <SettlementRefCell loadId={row.id} /> does
 * NOT fire N network requests. Any caller that already has the joined data from its own list query
 * should pass it directly via SettlementRefCell's `settlement` prop instead — this loader is the
 * fallback for surfaces that don't (or can't easily) project it themselves.
 */
import { getSettlementRefs, type SettlementRefRow } from "../api/loads";

type PendingBatch = {
  ids: Set<string>;
  resolvers: Map<string, Array<(row: SettlementRefRow | null) => void>>;
  timer: ReturnType<typeof setTimeout> | null;
};

const batches = new Map<string, PendingBatch>();

function getBatch(operatingCompanyId: string): PendingBatch {
  let batch = batches.get(operatingCompanyId);
  if (!batch) {
    batch = { ids: new Set(), resolvers: new Map(), timer: null };
    batches.set(operatingCompanyId, batch);
  }
  return batch;
}

async function flush(operatingCompanyId: string, batch: PendingBatch) {
  batches.delete(operatingCompanyId);
  const ids = [...batch.ids];
  if (ids.length === 0) return;
  try {
    const { refs } = await getSettlementRefs(operatingCompanyId, ids);
    const byId = new Map(refs.map((r) => [r.load_id, r]));
    for (const id of ids) {
      const row = byId.get(id) ?? null;
      for (const resolve of batch.resolvers.get(id) ?? []) resolve(row);
    }
  } catch {
    // Fail open per-cell — a missing settlement ref renders "Not on a tour" rather than crashing
    // the surface it's embedded in.
    for (const id of ids) {
      for (const resolve of batch.resolvers.get(id) ?? []) resolve(null);
    }
  }
}

/** Queue one loadId; resolves with that load's settlement-ref row (or null) once the batch for
 * this tick completes. Safe to call from many independent component instances at once. */
export function loadSettlementRef(operatingCompanyId: string, loadId: string): Promise<SettlementRefRow | null> {
  const batch = getBatch(operatingCompanyId);
  batch.ids.add(loadId);
  const p = new Promise<SettlementRefRow | null>((resolve) => {
    const list = batch.resolvers.get(loadId) ?? [];
    list.push(resolve);
    batch.resolvers.set(loadId, list);
  });
  if (!batch.timer) {
    batch.timer = setTimeout(() => void flush(operatingCompanyId, batch), 10);
  }
  return p;
}

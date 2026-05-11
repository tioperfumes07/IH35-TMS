export type ForensicPhase = "entities" | "transactions" | "attachments" | null;

export type ForensicProgressState = {
  current_phase: ForensicPhase;
  current_entity_type: string | null;
  current_page: number | null;
  current_total_pages: number | null;
  recent_errors: Array<{ at: string; message: string }>;
};

const progressByBatch = new Map<string, ForensicProgressState>();

function ensureProgress(batchId: string): ForensicProgressState {
  const existing = progressByBatch.get(batchId);
  if (existing) return existing;
  const created: ForensicProgressState = {
    current_phase: null,
    current_entity_type: null,
    current_page: null,
    current_total_pages: null,
    recent_errors: [],
  };
  progressByBatch.set(batchId, created);
  return created;
}

export function updateForensicProgress(batchId: string, patch: Partial<Omit<ForensicProgressState, "recent_errors">>) {
  const current = ensureProgress(batchId);
  progressByBatch.set(batchId, { ...current, ...patch, recent_errors: current.recent_errors });
}

export function appendForensicProgressError(batchId: string, message: string) {
  const current = ensureProgress(batchId);
  const next = [{ at: new Date().toISOString(), message }, ...current.recent_errors].slice(0, 5);
  progressByBatch.set(batchId, { ...current, recent_errors: next });
}

export function getForensicProgress(batchId: string) {
  return progressByBatch.get(batchId) ?? null;
}

export function clearForensicProgress(batchId: string) {
  progressByBatch.delete(batchId);
}

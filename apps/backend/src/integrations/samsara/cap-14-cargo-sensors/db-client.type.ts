// Shared minimal DB-client shape for the cap-14 cargo-sensor module.
// Extracted from ingester.service.ts to break the ingester <-> threshold import cycle
// (threshold.service.ts needed only this type). Type-only module — no runtime surface.
// Guarded by scripts/verify-no-circular-dependencies.mjs (verify-step 120).
export type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

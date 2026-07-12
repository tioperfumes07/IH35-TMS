// Shared minimal DB-client shape for the road-service module.
// Extracted from tickets.routes.ts to break the tickets.routes <-> wo-integration import cycle
// (wo-integration.ts needed only this type). Type-only module — no runtime surface.
// Guarded by scripts/verify-no-circular-dependencies.mjs (verify-step 120).
export type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

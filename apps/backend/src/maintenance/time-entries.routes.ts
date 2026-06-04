import type { FastifyInstance } from "fastify";

/** ARCHIVE-not-DELETE · Sunset 2026-09-01 · B34 canonical routes live in labor.routes.ts */
export function assertManualRange(startIso: string, endIso: string): boolean {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs;
}

export async function registerWoTimeEntriesRoutes(_app: FastifyInstance) {
  // Legacy work-orders console paths retained for import compatibility; B34 labor.routes owns WO labor CRUD.
}

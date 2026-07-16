/** Minimal query client shared by Relay fuel ingest / bridge (no cycle between modules). */
export type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

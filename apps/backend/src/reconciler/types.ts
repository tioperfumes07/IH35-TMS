/**
 * THE RECONCILER (docs/manuals/03-RULING-THE-RECONCILER-THE-ONE-GENERATIVE-CAUSE.md, Lead 2026-09-22).
 * One engine asserts the dispatch-to-cash chain as invariants and files every breach it cannot
 * repair as an exception. It holds no business logic and no GL math: a repair is only ever a call
 * into an existing engine, and where no engine exists the breach stays an exception.
 */

export type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type ReconcilerEntityType = "load";

export type ReconcilerException = {
  /** Stable across runs: `${invariant}/${entity_type}/${entity_id}/${field}`. */
  key: string;
  invariant: string;
  entity_type: ReconcilerEntityType;
  entity_id: string;
  /** What the owner reads — the load number, never a UUID. */
  entity_label: string;
  field: string;
  /** Plain English, operator-visible. */
  reason: string;
  /** ISO timestamp the breach is dated from, and which column it came from. */
  since: string;
  since_source: string;
  owner_seat: string;
  /** The existing engine a repair would call, or null when no engine exists (exception only). */
  repair_engine: string | null;
};

export type Invariant = {
  id: string;
  title: string;
  ownerSeat: string;
  repairEngine: string | null;
  detect(client: Queryable, operatingCompanyId: string): Promise<ReconcilerException[]>;
};

export type InvariantResult =
  | { invariant: string; title: string; status: "ok"; exceptions: ReconcilerException[] }
  | { invariant: string; title: string; status: "error"; error: string; exceptions: [] };

export type ReconcilerRun = {
  operating_company_id: string;
  ran_at: string;
  results: InvariantResult[];
  exception_count: number;
  errored_invariants: string[];
};

/**
 * E-41 — Engine status board reads (Round 306).
 * Aggregates integrations.integration_sync_log + per-engine output table 24h counts.
 * Red when shouldProduce and nothing in the expected window.
 */
import type { PoolClient } from "pg";
import { ENGINE_STATUS_CATALOG, type EngineCatalogEntry } from "./engine-status.catalog.js";

export type EngineHealth = "ok" | "red" | "idle" | "n/a" | "pending" | "screen";

export type EngineStatusRow = {
  id: string;
  name: string;
  module: string;
  domain: string;
  schedule: string;
  owner_seat: string;
  kind: EngineCatalogEntry["kind"];
  should_produce: boolean;
  expected_window_hours: number | null;
  last_run_at: string | null;
  last_run_success: boolean | null;
  last_error: string | null;
  rows_written_24h: number | null;
  rows_probe_note: string | null;
  next_run_hint: string | null;
  health: EngineHealth;
  health_reason: string;
};

const IDENT = /^[a-z_][a-z0-9_]*$/i;

function assertIdent(name: string, label: string) {
  if (!IDENT.test(name)) throw new Error(`unsafe ${label}: ${name}`);
}

function splitRelation(relation: string): { schema: string; table: string } {
  const [schema, table] = relation.split(".");
  if (!schema || !table) throw new Error(`bad relation ${relation}`);
  assertIdent(schema, "schema");
  assertIdent(table, "table");
  return { schema, table };
}

async function relationExists(client: PoolClient, relation: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

async function countLast24h(
  client: PoolClient,
  entry: EngineCatalogEntry,
  operatingCompanyId: string
): Promise<{ count: number | null; note: string | null }> {
  if (!entry.output) return { count: null, note: "no output probe" };
  const { relation, tsColumn, companyColumn } = entry.output;
  assertIdent(tsColumn, "tsColumn");
  if (companyColumn) assertIdent(companyColumn, "companyColumn");
  const exists = await relationExists(client, relation);
  if (!exists) return { count: null, note: `${relation} not present` };
  const { schema, table } = splitRelation(relation);
  try {
    if (companyColumn) {
      const res = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
           FROM ${schema}.${table}
          WHERE ${companyColumn} = $1::uuid
            AND ${tsColumn} >= now() - interval '24 hours'`,
        [operatingCompanyId]
      );
      return { count: Number(res.rows[0]?.n ?? 0), note: null };
    }
    const res = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM ${schema}.${table}
        WHERE ${tsColumn} >= now() - interval '24 hours'`
    );
    return { count: Number(res.rows[0]?.n ?? 0), note: null };
  } catch (err) {
    return { count: null, note: `probe failed: ${(err as Error).message?.slice(0, 120) ?? "error"}` };
  }
}

async function latestSyncLog(
  client: PoolClient,
  syncKinds: string[],
  operatingCompanyId: string
): Promise<{ finished_at: string | null; success: boolean | null; error_message: string | null; rows_added: number | null }> {
  if (syncKinds.length === 0) {
    return { finished_at: null, success: null, error_message: null, rows_added: null };
  }
  const res = await client.query<{
    finished_at: string | null;
    success: boolean | null;
    error_message: string | null;
    rows_added: number | null;
  }>(
    `SELECT finished_at::text, success, error_message, rows_added
       FROM integrations.integration_sync_log
      WHERE operating_company_id = $1::uuid
        AND sync_kind = ANY($2::text[])
      ORDER BY COALESCE(finished_at, started_at) DESC
      LIMIT 1`,
    [operatingCompanyId, syncKinds]
  );
  const row = res.rows[0];
  if (!row) return { finished_at: null, success: null, error_message: null, rows_added: null };
  return {
    finished_at: row.finished_at,
    success: row.success,
    error_message: row.error_message,
    rows_added: row.rows_added,
  };
}

function nextRunHint(schedule: string, lastRunAt: string | null, windowHours: number | null): string | null {
  if (!windowHours) return schedule === "—" ? null : schedule;
  if (!lastRunAt) return `due (window ${windowHours}h) · ${schedule}`;
  const last = Date.parse(lastRunAt);
  if (Number.isNaN(last)) return schedule;
  const nextMs = last + windowHours * 3600_000;
  return new Date(nextMs).toISOString();
}

function healthFor(entry: EngineCatalogEntry, opts: {
  lastRunAt: string | null;
  lastSuccess: boolean | null;
  lastError: string | null;
  rows24h: number | null;
  probeNote: string | null;
}): { health: EngineHealth; reason: string } {
  if (entry.kind === "screen") return { health: "screen", reason: "screen — not a producer" };
  if (entry.kind === "pending") return { health: "pending", reason: "not built yet" };
  if (!entry.shouldProduce || entry.expectedWindowHours == null) {
    return { health: "n/a", reason: "on-read / no production window" };
  }
  if (opts.lastSuccess === false || (opts.lastError && opts.lastError.trim())) {
    return { health: "red", reason: opts.lastError?.trim() || "last sync failed" };
  }
  // Missing output table (migration pending) is idle, not red — owner sees the note.
  if (opts.probeNote && /not present|probe failed/i.test(opts.probeNote) && opts.rows24h == null && !opts.lastRunAt) {
    return { health: "idle", reason: opts.probeNote };
  }
  const silent =
    (opts.rows24h != null && opts.rows24h === 0 && !opts.lastRunAt) ||
    (opts.rows24h === 0 && opts.lastRunAt == null) ||
    (opts.rows24h == null && !opts.lastRunAt && !opts.probeNote);
  if (opts.rows24h === 0) {
    return { health: "red", reason: "should produce — 0 rows in 24 h" };
  }
  if (silent) {
    return { health: "red", reason: "should produce — nothing in window" };
  }
  if (opts.lastRunAt) {
    const ageH = (Date.now() - Date.parse(opts.lastRunAt)) / 3600_000;
    if (!Number.isNaN(ageH) && ageH > entry.expectedWindowHours) {
      return { health: "red", reason: `last run ${ageH.toFixed(1)}h ago > ${entry.expectedWindowHours}h window` };
    }
  }
  if (opts.rows24h != null && opts.rows24h > 0) return { health: "ok", reason: `${opts.rows24h} rows / 24h` };
  if (opts.lastRunAt) return { health: "ok", reason: "recent sync" };
  return { health: "idle", reason: opts.probeNote ?? "no signal yet" };
}

export async function fetchEngineStatusBoard(
  client: PoolClient,
  operatingCompanyId: string
): Promise<{ engines: EngineStatusRow[]; catalog_count: number; measured_at: string }> {
  const engines: EngineStatusRow[] = [];
  for (const entry of ENGINE_STATUS_CATALOG) {
    const sync = await latestSyncLog(client, entry.syncKinds, operatingCompanyId);
    const probe = await countLast24h(client, entry, operatingCompanyId);
    const rows24h =
      probe.count != null
        ? probe.count
        : sync.rows_added != null
          ? Number(sync.rows_added)
          : null;
    const { health, reason } = healthFor(entry, {
      lastRunAt: sync.finished_at,
      lastSuccess: sync.success,
      lastError: sync.error_message,
      rows24h,
      probeNote: probe.note,
    });
    engines.push({
      id: entry.id,
      name: entry.name,
      module: entry.module,
      domain: entry.domain,
      schedule: entry.schedule,
      owner_seat: entry.ownerSeat,
      kind: entry.kind,
      should_produce: entry.shouldProduce,
      expected_window_hours: entry.expectedWindowHours,
      last_run_at: sync.finished_at,
      last_run_success: sync.success,
      last_error: sync.error_message,
      rows_written_24h: rows24h,
      rows_probe_note: probe.note,
      next_run_hint: nextRunHint(entry.schedule, sync.finished_at, entry.expectedWindowHours),
      health,
      health_reason: reason,
    });
  }
  return {
    engines,
    catalog_count: ENGINE_STATUS_CATALOG.length,
    measured_at: new Date().toISOString(),
  };
}

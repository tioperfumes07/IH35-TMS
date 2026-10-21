import { EventEmitter } from "node:events";
import pg from "pg";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";

/**
 * LEAD 443.208R — the ONE load-change signal, server side.
 *
 * Migration 202616060700 puts an AFTER INSERT/UPDATE/DELETE trigger on every table a load view reads; it
 * pg_notify('load_changed', {company_id, load_ids, table, op}) and Postgres delivers it only at COMMIT. This bus holds ONE
 * dedicated pg client that LISTENs and re-emits each payload in-process; the notifications SSE stream forwards it to every
 * open browser of that company as `event: load.changed`.
 *
 * LISTEN needs a session connection: a PgBouncer / Neon "-pooler" endpoint in transaction mode silently never delivers it.
 * The connection string is DATABASE_DIRECT_URL, else DATABASE_URL with the Neon "-pooler" host suffix removed (the same
 * project's direct endpoint). On every (re)connect it CATCHES UP: load rows whose updated_at moved since the last event it
 * delivered are emitted once, so a notify missed while disconnected is never lost (trg_loads_updated_at keeps updated_at
 * true on every write).
 */

export type LoadChangedEvent = {
  company_id: string | null;
  load_ids: string[];
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE" | "CATCH_UP";
};

export const LOAD_CHANGED_CHANNEL = "load_changed";

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function onLoadChanged(listener: (event: LoadChangedEvent) => void): () => void {
  bus.on("load_changed", listener);
  return () => {
    bus.off("load_changed", listener);
  };
}

/** Pure: the payload a trigger sent, or null when it is not one of ours. */
export function parseLoadChangedPayload(raw: string | undefined): LoadChangedEvent | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<LoadChangedEvent>;
    if (!Array.isArray(p.load_ids) || p.load_ids.length === 0) return null;
    return {
      company_id: typeof p.company_id === "string" ? p.company_id : null,
      load_ids: p.load_ids.filter((x): x is string => typeof x === "string"),
      table: typeof p.table === "string" ? p.table : "unknown",
      op: (p.op as LoadChangedEvent["op"]) ?? "UPDATE",
    };
  } catch {
    return null;
  }
}

/** Pure: the session (non-pooler) connection string LISTEN needs. */
export function directConnectionString(env: NodeJS.ProcessEnv): string | null {
  const direct = env.DATABASE_DIRECT_URL?.trim();
  const pooled = env.DATABASE_URL?.trim();
  if (direct && direct !== pooled) return direct;
  if (!pooled) return direct || null;
  return pooled.replace(/(@[^/?]*?)-pooler(\.)/, "$1$2");
}

export function emitLoadChanged(event: LoadChangedEvent): void {
  bus.emit("load_changed", event);
}

type Logger = { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };

let started = false;
let stopping = false;
let client: pg.Client | null = null;
let lastSeen: string | null = null;

async function catchUp(c: pg.Client, log: Logger): Promise<void> {
  if (!lastSeen) {
    const r = await c.query<{ now: string }>(`SELECT now()::text AS now`);
    lastSeen = r.rows[0]?.now ?? null;
    return;
  }
  await c.query("BEGIN");
  try {
    await c.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const r = await c.query<{ company_id: string; load_ids: string[]; max_at: string }>(
      `SELECT operating_company_id::text AS company_id, array_agg(id::text) AS load_ids, max(updated_at)::text AS max_at
         FROM mdata.loads
        WHERE updated_at > $1::timestamptz
        GROUP BY operating_company_id`,
      [lastSeen]
    );
    await c.query("COMMIT");
    for (const row of r.rows) {
      emitLoadChanged({ company_id: row.company_id, load_ids: row.load_ids.slice(0, 200), table: "mdata.loads", op: "CATCH_UP" });
      if (!lastSeen || row.max_at > lastSeen) lastSeen = row.max_at;
    }
    if (r.rows.length) log.info({ companies: r.rows.length }, "[load-change-bus] caught up after reconnect");
  } catch (err) {
    await c.query("ROLLBACK").catch(() => undefined);
    log.warn({ err }, "[load-change-bus] catch-up read failed");
  }
}

async function connectOnce(cs: string, log: Logger): Promise<void> {
  const c = new pg.Client(buildPgClientConfig(cs, { application_name: "ih35-load-change-bus" }));
  c.on("notification", (msg) => {
    if (msg.channel !== LOAD_CHANGED_CHANNEL) return;
    const event = parseLoadChangedPayload(msg.payload);
    if (!event) return;
    lastSeen = new Date().toISOString();
    emitLoadChanged(event);
  });
  await c.connect();
  client = c;
  await c.query(`LISTEN ${LOAD_CHANGED_CHANNEL}`);
  await catchUp(c, log);
  log.info({}, "[load-change-bus] listening");
  await new Promise<void>((resolve) => {
    c.once("error", (err) => {
      log.warn({ err }, "[load-change-bus] connection error");
      resolve();
    });
    c.once("end", () => resolve());
  });
  client = null;
  await c.end().catch(() => undefined);
}

/** Started once beside startOutboxProcessor. Never throws; reconnects with backoff until the process stops. */
export function startLoadChangeBus(log: Logger, env: NodeJS.ProcessEnv = process.env): void {
  if (started) return;
  const cs = directConnectionString(env);
  if (!cs) {
    log.warn({}, "[load-change-bus] no DATABASE_URL — not started");
    return;
  }
  started = true;
  void (async () => {
    let delay = 1000;
    while (!stopping) {
      const t0 = Date.now();
      try {
        await connectOnce(cs, log);
      } catch (err) {
        log.warn({ err }, "[load-change-bus] connect failed");
      }
      if (stopping) break;
      if (Date.now() - t0 > 60_000) delay = 1000;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30_000);
    }
  })();
}

export async function stopLoadChangeBus(): Promise<void> {
  stopping = true;
  await client?.end().catch(() => undefined);
}

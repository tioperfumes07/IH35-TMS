/**
 * E1-SMOKE-SERVICE-TOKEN-AUTH
 *
 * Daily smoke probe endpoint — read-only critical path checks.
 * Authenticated via service token ONLY (no user session required).
 * Safe to call from cron / external monitors.
 *
 * GET /api/v1/internal/smoke-probe
 * Returns: { ok: boolean, checks: SmokeCheck[], ts: string }
 *
 * Checks:
 *   1. db_ping          — pool can execute SELECT 1
 *   2. event_log_read   — events.event_log table is readable (SELECT COUNT)
 *   3. loads_read       — mdata.loads table is readable
 *   4. invoices_read    — accounting.invoices table is readable
 *   5. spine_write_gate — events.log_event() function exists (does NOT call it)
 */
import type { FastifyInstance } from "fastify";
import { pool } from "../auth/db.js";
import { requireServiceToken } from "../auth/service-token.middleware.js";

type SmokeStatus = "ok" | "fail" | "skip";

type SmokeCheck = {
  name: string;
  status: SmokeStatus;
  duration_ms: number;
  error?: string;
};

async function runCheck(name: string, fn: () => Promise<void>): Promise<SmokeCheck> {
  const start = Date.now();
  try {
    await fn();
    return { name, status: "ok", duration_ms: Date.now() - start };
  } catch (err) {
    return {
      name,
      status: "fail",
      duration_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function registerSmokeProbeRoutes(app: FastifyInstance) {
  app.get("/api/v1/internal/smoke-probe", async (req, reply) => {
    if (!requireServiceToken(req, reply)) return;

    const checks: SmokeCheck[] = [];

    const client = await pool.connect().catch((err) => {
      checks.push({ name: "db_ping", status: "fail", duration_ms: 0, error: String(err) });
      return null;
    });

    if (!client) {
      return reply.code(503).send({ ok: false, checks, ts: new Date().toISOString() });
    }

    try {
      checks.push(await runCheck("db_ping", async () => {
        await client.query("SELECT 1");
      }));

      checks.push(await runCheck("event_log_read", async () => {
        await client.query("SELECT COUNT(*) FROM events.event_log LIMIT 1");
      }));

      checks.push(await runCheck("loads_read", async () => {
        await client.query("SELECT COUNT(*) FROM mdata.loads LIMIT 1");
      }));

      checks.push(await runCheck("invoices_read", async () => {
        await client.query("SELECT COUNT(*) FROM accounting.invoices LIMIT 1");
      }));

      checks.push(await runCheck("spine_write_gate", async () => {
        const res = await client.query(
          `SELECT proname FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'events' AND p.proname = 'log_event'
           LIMIT 1`
        );
        if (!res.rows.length) throw new Error("events.log_event() function not found");
      }));
    } finally {
      client.release();
    }

    const ok = checks.every((c) => c.status === "ok");
    return reply.code(ok ? 200 : 503).send({ ok, checks, ts: new Date().toISOString() });
  });
}

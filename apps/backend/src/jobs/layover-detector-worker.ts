/**
 * GAP-28 — Layover detection worker (every 6h).
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { detectLayovers } from "../dispatch/layovers/detection.service.js";

const WORKER_NAME = "dispatch.layover_detector";
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.LAYOVER_DETECTOR_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function tick(app: FastifyInstance) {
  const total = await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id FROM org.companies WHERE active = true LIMIT 100`
    ).catch(() => ({ rows: [] as { id: string }[] }));

    let count = 0;
    for (const { id } of companies.rows) {
      try { count += await detectLayovers(client, id); }
      catch (err) { app.log.warn({ err, company_id: id }, `[${WORKER_NAME}] company failed`); }
    }
    return count;
  });
  app.log.info({ total }, `[${WORKER_NAME}] tick complete`);
}

export function initializeLayoverDetectorWorker(app: FastifyInstance) {
  const ms = intervalMs();
  const run = async () => {
    try { await tick(app); }
    catch (err) { app.log.error({ err }, `[${WORKER_NAME}] tick failed`); }
  };
  void run();
  timer = setInterval(() => { void run(); }, ms);
  app.log.info({ intervalMs: ms }, `[${WORKER_NAME}] started`);
  return () => { if (timer) { clearInterval(timer); timer = undefined; } };
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export type PerfPercentiles = {
  count: number;
  p50: number;
  p95: number;
  p99: number;
};

const MAX_SAMPLES = 500;
const buckets = new Map<string, number[]>();

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function computePercentiles(samples: number[]): PerfPercentiles {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

export function recordResponseTime(routeKey: string, ms: number) {
  const list = buckets.get(routeKey) ?? [];
  list.push(ms);
  if (list.length > MAX_SAMPLES) list.shift();
  buckets.set(routeKey, list);
}

export function getPerfMetrics(): Record<string, PerfPercentiles> {
  const out: Record<string, PerfPercentiles> = {};
  for (const [key, samples] of buckets) {
    out[key] = computePercentiles(samples);
  }
  return out;
}

export function resetPerfMetrics() {
  buckets.clear();
}

type TimedRequest = FastifyRequest & { _perfStart?: number };

export async function registerResponseTimeMiddleware(app: FastifyInstance) {
  app.addHook("onRequest", async (req) => {
    (req as TimedRequest)._perfStart = performance.now();
  });
  app.addHook("onResponse", async (req, reply) => {
    const start = (req as TimedRequest)._perfStart;
    if (start == null) return;
    const ms = performance.now() - start;
    const routeUrl = reply.routeOptions?.url ?? req.url;
    recordResponseTime(`${req.method} ${routeUrl}`, ms);
  });
}

export async function registerPerfMetricsRoute(
  app: FastifyInstance,
  requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<boolean>
) {
  app.get("/api/v1/internal/perf-metrics", async (req, reply) => {
    if (!(await requireAuth(req, reply))) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return getPerfMetrics();
  });
}

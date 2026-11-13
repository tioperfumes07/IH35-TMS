// apps/backend/src/program/audit-scoreboard.routes.ts
//
// Read-only Program module-matrix endpoint (GET /api/v1/program/module-matrix).
//
// The program scoreboard (GET /api/v1/program/audit-scoreboard and its recent-activity feed) was
// removed on owner order 2026-11-12; this file keeps its historical name because the module-matrix
// guards reference it, but it now registers only the module-matrix route.
//
// NON-FINANCIAL. Light Neon `SELECT now()` stamps meta.prodReadAt (honest "live prod
// read"). Never query accounting.*.

import { execSync } from "node:child_process";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import { resolveClientIp } from "../config/client-ip.js";
import { formatCt } from "./program-board.service.js";
import { buildModuleMatrix, buildSystemModuleMatrix } from "./module-matrix.service.js";

const REPO_ROOT = (() => {
  try {
    return resolveMonorepoRoot(import.meta.url);
  } catch {
    return process.cwd();
  }
})();

/**
 * Deployed SHA is CONSTANT for a process lifetime, so running git per request was pure waste on
 * the event loop. Render supplies RENDER_GIT_COMMIT, so git normally never runs at all.
 */
let tipShaMemo: string | undefined | null = null;
export function resolveTipShaCached(): string | undefined {
  if (tipShaMemo !== null) return tipShaMemo;
  const env = String(process.env.RENDER_GIT_COMMIT ?? process.env.GITHUB_SHA ?? "").trim();
  if (env) {
    tipShaMemo = env.slice(0, 9);
    return tipShaMemo;
  }
  try {
    tipShaMemo = execSync("git rev-parse --short HEAD", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3_000,
    }).trim();
  } catch {
    tipShaMemo = undefined;
  }
  return tipShaMemo;
}

/**
 * PROD-OUTAGE-MATRIX-POLL-STORM (2026-08-21): a hard, self-contained per-IP cap on the
 * expensive module-matrix projections.
 *
 * Six agent-driven browsers left open on the matrix page drove ~71 req/s of a 223 KB payload
 * (~15 MB/s) at production. That starved the Node event loop, so the trivial
 * `/api/v1/_healthcheck` (which only returns {status:"ok"}) took 25.9s against Render's 5s
 * timeout. Render SIGTERM-killed every instance (29 server_failed, nonZeroExit 143,
 * evicted:false = not OOM) and the API was down for hours.
 *
 * These routes ALREADY declare `config: { rateLimit: { max: 60, timeWindow: "1 minute" } }`,
 * but that never fired: 150 parallel requests against the deployed service returned 150
 * responses and ZERO 429s. Until that plugin-level failure is root-caused separately, the
 * endpoint that can take production down must not depend on it. This gate is in the handler,
 * so it cannot be bypassed by plugin encapsulation or hook-ordering.
 *
 * Normal cost: the page polls every 30s => 2 req/min. 20/min leaves 10x headroom for a human
 * reloading, while capping a runaway client at 20/min instead of 4,260/min.
 */
const MATRIX_MAX_PER_MIN = 20;
const MATRIX_WINDOW_MS = 60_000;
const matrixHits = new Map<string, { count: number; windowStart: number }>();

function matrixThrottleExceeded(ip: string, now: number): boolean {
  // Bound the map so a spoofed-header flood cannot grow it without limit.
  if (matrixHits.size > 5_000) {
    for (const [k, v] of matrixHits) {
      if (now - v.windowStart > MATRIX_WINDOW_MS) matrixHits.delete(k);
    }
  }
  const cur = matrixHits.get(ip);
  if (!cur || now - cur.windowStart >= MATRIX_WINDOW_MS) {
    matrixHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  cur.count += 1;
  return cur.count > MATRIX_MAX_PER_MIN;
}

/** Exported for the guard/selftest. */
export function __matrixThrottleForTest(ip: string, now: number): boolean {
  return matrixThrottleExceeded(ip, now);
}

async function stampProdReadAt(
  req: FastifyRequest,
): Promise<{ prodReadAt: string; prodReadSource: "neon_now" | "request_time" }> {
  const uuid = req.user?.uuid;
  if (uuid) {
    try {
      const t = await withCurrentUser(uuid, async (client) => {
        const r = await client.query<{ t: Date }>("SELECT now() AS t");
        return r.rows[0]?.t ?? null;
      });
      const label = formatCt(t);
      if (label) return { prodReadAt: label, prodReadSource: "neon_now" };
    } catch {
      /* fall through — never 500 the board for a stamp failure */
    }
  }
  return { prodReadAt: formatCt(new Date()) || "—", prodReadSource: "request_time" };
}

export async function registerAuditScoreboardRoutes(app: FastifyInstance) {
  // CodeQL js/missing-rate-limiting: auth + filesystem/GitHub/Neon stamp must be rate-limited.
  // MATRIX-LIVE-RAD — Audited/Done projection for /program/matrix (not SAMPLE).
  app.get(
    "/api/v1/program/module-matrix",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return reply;
      const clientIp = resolveClientIp(req as never);
      if (matrixThrottleExceeded(clientIp, Date.now())) {
        reply.header("retry-after", "60");
        return reply.code(429).send({
          error: "rate_limited",
          message:
            "Module matrix is capped at 20 requests per minute per client. Close duplicate/automated tabs; the board polls every 30s.",
        });
      }
      const q = (req.query ?? {}) as { module?: unknown; scope?: unknown };
      const scope = typeof q.scope === "string" ? q.scope.trim().toLowerCase() : "";
      if (scope === "system" || scope === "all") {
        try {
          const payload = await buildSystemModuleMatrix(req.user?.uuid);
          reply.header("cache-control", "no-store");
          return reply.send({
            ...payload,
            meta: {
              ...payload.meta,
              prodReadAt: formatCt(new Date()) || "—",
              prodReadSource: "request_time",
            },
          });
        } catch (err) {
          req.log?.error?.({ err }, "[program] module-matrix system rollup failed");
          let tip: string | undefined;
          try {
            tip = resolveTipShaCached();
          } catch {
            tip = undefined;
          }
          return reply.code(503).send({
            error: "module_matrix_system_unavailable",
            message: err instanceof Error ? err.message : "Could not project system-wide matrix rollup",
            tipSha: tip,
          });
        }
      }
      const moduleId =
        typeof q.module === "string" && q.module.trim() ? q.module.trim().toLowerCase() : "maintenance";
      const SUPPORTED = new Set([
        "maintenance",
        "safety",
        "insurance",
        "legal",
        "accounting",
        "banking",
        "dispatch",
        "settlements",
        "fuel",
        "drivers",
        "fleet",
        "customers",
        "vendors",
        "lists",
        "factoring",
        "reports",
        "inventory",
        "compliance",
        "cash-flow",
        "home",
        "program",
        "tasks",
        "form_425",
        "finance",
        "docs",
        "system",
        "users",
        "help",
        "driver-hub",
      ]);
      if (!SUPPORTED.has(moduleId)) {
        return reply.code(400).send({
          error: "unsupported_module",
          message: `module-matrix supports module=maintenance|safety|insurance|legal|accounting|banking|dispatch|settlements|fuel|drivers|fleet|customers|vendors|lists|factoring|reports|inventory|compliance|cash-flow|home|program|tasks|form_425|finance|docs|system|users|help|driver-hub`,
        });
      }
      try {
        const payload = await buildModuleMatrix(moduleId, req.user?.uuid);
        const { prodReadAt, prodReadSource } = await stampProdReadAt(req);
        reply.header("cache-control", "no-store");
        return reply.send({
          ...payload,
          meta: {
            ...payload.meta,
            prodReadAt,
            prodReadSource,
          },
        });
      } catch (err) {
        req.log?.error?.({ err }, "[program] module-matrix projection failed");
        return reply.code(503).send({
          error: "module_matrix_unavailable",
          message: "Could not project live Audited/Done — frontend must keep SAMPLE banner",
        });
      }
    },
  );
}

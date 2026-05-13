import type { FastifyInstance } from "fastify";

function redirectPreservingQuery(app: FastifyInstance, fromPath: string, toPath: string) {
  app.get(fromPath, async (req, reply) => {
    const q = req.query as Record<string, unknown>;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) for (const item of v) sp.append(k, String(item));
      else sp.append(k, String(v));
    }
    const suffix = sp.toString();
    const dest = `${toPath}${suffix ? `?${suffix}` : ""}`;
    return reply.code(307).redirect(dest);
  });
}

/** Canonical `/api/v1/home/*` aliases for dashboard consumers (implementation lives under reports). */
export async function registerHomeRoutes(app: FastifyInstance) {
  redirectPreservingQuery(app, "/api/v1/home/attention-list", "/api/v1/reports/home-attention-list");
  redirectPreservingQuery(app, "/api/v1/home/fleet-snapshot", "/api/v1/reports/home-fleet-snapshot");
}

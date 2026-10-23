/**
 * LEAD 443.278 (3) — the no-5xx live guard runs the REAL app in-process through fastify.inject, against prod READ-ONLY,
 * as a service principal: no HTTP session cookie, no network hop, no write path.
 *
 * Booted only by scripts/verify-live-get-routes-no-5xx.mjs with IH35_INJECT_GET_SWEEP=1 (index.ts main(): the onRoute
 * collector is installed before any route registers; after every route registers, the sweep runs and the process exits
 * BEFORE listen() and before any cron/worker starts). The principal is the System Automation user
 * (00000000-0000-4000-8000-000000000001, the actor the fence/auto-delivery engines already write as), passed through the
 * existing non-production test-auth path (IH35_TEST_AUTH_BYPASS, dead when NODE_ENV=production).
 */
import fs from "node:fs";
import type { FastifyInstance, RouteOptions } from "fastify";

export const INJECT_SWEEP_PRINCIPAL = { id: "00000000-0000-4000-8000-000000000001", role: "Administrator", email: null };
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function injectGetSweepEnabled(): boolean {
  return process.env.IH35_INJECT_GET_SWEEP === "1";
}

const collected = new Set<string>();

/** Install before any route registers: records every parameter-free GET route the app actually mounts. */
export function collectGetRoutes(app: FastifyInstance): void {
  app.addHook("onRoute", (route: RouteOptions) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (!methods.includes("GET")) return;
    const url = String(route.url ?? "");
    if (!url.startsWith("/api/v1/") || url.includes(":") || url.includes("*")) return;
    collected.add(url);
  });
}

export type InjectSweepResult = {
  routes: number;
  ok: number;
  fourxx: number;
  fivexx: Array<{ route: string; status: number; error: string }>;
};

export async function runInjectGetSweep(app: FastifyInstance, { concurrency = 6, timeoutMs = 20_000 } = {}): Promise<InjectSweepResult> {
  const routes = [...collected].sort();
  const auth = Buffer.from(JSON.stringify(INJECT_SWEEP_PRINCIPAL)).toString("base64url");
  const result: InjectSweepResult = { routes: routes.length, ok: 0, fourxx: 0, fivexx: [] };
  let i = 0;
  async function worker() {
    while (i < routes.length) {
      const route = routes[i++]!;
      try {
        const res = await Promise.race([
          app.inject({ method: "GET", url: `${route}?operating_company_id=${USMCA}`, headers: { "x-test-auth": auth } }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)),
        ]);
        if (res.statusCode >= 500) {
          let error = res.body.slice(0, 300);
          try {
            const j = JSON.parse(res.body) as { error?: unknown; message?: unknown };
            error = String(j.message ?? j.error ?? error).slice(0, 300);
          } catch {
            /* non-JSON body: keep the raw slice */
          }
          result.fivexx.push({ route, status: res.statusCode, error });
        } else if (res.statusCode >= 400) result.fourxx += 1;
        else result.ok += 1;
      } catch (err) {
        result.fivexx.push({ route, status: 0, error: String((err as Error)?.message ?? err).slice(0, 300) });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return result;
}

/** index.ts main() hook: run, write the result where the guard asked, exit (never listen, never start a worker). */
export async function runInjectGetSweepAndExit(app: FastifyInstance): Promise<never> {
  await app.ready();
  const result = await runInjectGetSweep(app);
  const out = process.env.IH35_INJECT_GET_SWEEP_OUT;
  if (out) fs.writeFileSync(out, JSON.stringify(result));
  else console.log(JSON.stringify(result));
  process.exit(0);
}

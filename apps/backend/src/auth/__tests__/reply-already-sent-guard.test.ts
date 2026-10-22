// LEAD 443.237 — prod after every pod boot (stale cookies): GET /api/v1/equipment-transfers, /api/v1/maintenance/dashboard/kpis and
// /api/integrations/samsara/positions/active-loads answered 401, then threw ERR_HTTP_HEADERS_SENT + FST_ERR_REP_ALREADY_SENT — the
// auth helper sent the 401, the handler returned undefined while an async onSend hook was still running. One shared guard
// (installReplyAlreadySentGuard, installed before routes) makes every such route send exactly once.
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { installReplyAlreadySentGuard } from "../reply-already-sent-guard.js";
import { registerEquipmentTransferRoutes } from "../../mdata/equipment-transfer.routes.js";
import { registerMaintenanceDashboardKpisRoutes } from "../../maintenance/dashboard-kpis.routes.js";
import { registerSamsaraLivePositionRoutes } from "../../integrations/samsara/positions/live-position.routes.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PATHS = [
  `/api/v1/equipment-transfers?operating_company_id=${OPCO}`,
  `/api/v1/maintenance/dashboard/kpis?operating_company_id=${OPCO}`,
  `/api/integrations/samsara/positions/active-loads?operating_company_id=${OPCO}`,
];

async function run(withGuard: boolean) {
  const logs: string[] = [];
  const app = Fastify({ logger: { level: "info", stream: { write: (line: string) => { logs.push(line); } } } });
  if (withGuard) installReplyAlreadySentGuard(app);
  await app.register(cookie);
  app.addHook("preHandler", async (req, reply) => {
    reply.clearCookie("ih35_session", { path: "/" });
    (req as unknown as { user: null; session: null }).user = null;
    (req as unknown as { user: null; session: null }).session = null;
  });
  app.addHook("onSend", async (_req, _reply, payload) => { await new Promise((r) => setTimeout(r, 5)); return payload; });
  await registerEquipmentTransferRoutes(app);
  await registerMaintenanceDashboardKpisRoutes(app);
  await registerSamsaraLivePositionRoutes(app);
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const results: Array<{ status: number; body: string }> = [];
  for (const p of PATHS) {
    const res = await fetch(`${address}${p}`, { headers: { cookie: "ih35_session=stale" } });
    results.push({ status: res.status, body: await res.text() });
  }
  await new Promise((r) => setTimeout(r, 100));
  await app.close();
  return { results, doubleSends: logs.filter((l) => /already sent|HEADERS_SENT|forget to/.test(l)).length };
}

describe("443.237 — no route sends after a 401", () => {
  it("the three prod routes answer one clean 401 each with the guard", async () => {
    const r = await run(true);
    expect(r.results.map((x) => x.status)).toEqual([401, 401, 401]);
    for (const x of r.results) expect(JSON.parse(x.body)).toEqual({ error: "unauthorized" });
    expect(r.doubleSends).toBe(0);
  });
  it("without the guard the same routes double-send (the prod defect)", async () => {
    const r = await run(false);
    expect(r.doubleSends).toBeGreaterThan(0);
  });
});

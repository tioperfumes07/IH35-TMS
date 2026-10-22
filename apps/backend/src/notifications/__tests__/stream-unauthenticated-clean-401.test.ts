// LEAD 443.232 a — prod 10-22: every 30 s per signed-out tab, GET /api/v1/notifications/stream?channels=loads answered 401
// and then threw ERR_HTTP_HEADERS_SENT + FST_ERR_REP_ALREADY_SENT ("did you forget to return reply"): the handler returned
// undefined after requireAuth had already sent the 401. An unauthenticated stream must get ONE clean 401 and log no error.
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../realtime/load-change-bus.js", () => ({ onLoadChanged: vi.fn(() => () => undefined), LOAD_CHANGED_CHANNEL: "load_changed" }));
import { registerNotificationStreamRoutes } from "../stream.routes.js";

describe("notification stream — unauthenticated (443.232 a)", () => {
  it("one clean 401, no 'reply already sent' error", async () => {
    const errors: string[] = [];
    const app = Fastify({ logger: { level: "info", stream: { write: (line: string) => { errors.push(line); } } } });
    await app.register(cookie); // the real app registers it: its async onSend hook is what exposed the double send
    // The real session preHandler on a stale / expired session: clears the cookie, leaves no user (session-middleware.ts).
    app.addHook("preHandler", async (req, reply) => {
      reply.clearCookie("ih35_session", { path: "/" });
      (req as unknown as { user: null; session: null }).user = null;
      (req as unknown as { user: null; session: null }).session = null;
    });
    // prod runs async onSend hooks (security headers, rate limit, compression): the 401 is still in flight when the handler
    // resolves — an undefined return then makes Fastify send a second time.
    app.addHook("onSend", async (_req, _reply, payload) => { await new Promise((r) => setTimeout(r, 5)); return payload; });
    await registerNotificationStreamRoutes(app);
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const res = await fetch(`${address}/api/v1/notifications/stream?channels=loads`, { headers: { cookie: "ih35_session=expired", accept: "text/event-stream" } });
    const body = await res.text();
    await new Promise((r) => setTimeout(r, 100));
    expect(res.status).toBe(401);
    expect(JSON.parse(body)).toEqual({ error: "unauthorized" });
    if (process.env.CC2_DEBUG) console.log(errors.join("\n").slice(0, 2000));
    expect(errors.filter((e) => /already sent|HEADERS_SENT|forget to/.test(e))).toEqual([]);
    await app.close();
  });
});

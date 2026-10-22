/**
 * LEAD 443.237 — "no route sends after a 401". ~1,950 handlers follow `const user = authed(req, reply); if (!user) return;`:
 * the auth helper sends the 401, the async handler resolves undefined. The app runs async onSend hooks (cookie, security
 * headers): while the 401 is still in flight Fastify sees an undefined result on an unsent reply and sends AGAIN →
 * ERR_HTTP_HEADERS_SENT + FST_ERR_REP_ALREADY_SENT (prod: equipment-transfers, maintenance KPIs, samsara active-loads after
 * every pod boot = stale cookies; the notification stream before #27158).
 * ONE shared fix, installed before any route: a first, synchronous onSend hook marks the reply as sending, and every route
 * handler is wrapped so an undefined result on a reply that is already sending returns the reply itself (Fastify's own rule:
 * "return reply" after send in an async handler). Handlers that return a value are untouched.
 */
import type { FastifyInstance, FastifyReply } from "fastify";

export const REPLY_SENDING = Symbol.for("ih35.replySending");

export function replyIsSending(reply: FastifyReply): boolean {
  return Boolean((reply as unknown as Record<symbol, unknown>)[REPLY_SENDING]) || reply.sent;
}

export function installReplyAlreadySentGuard(app: FastifyInstance): void {
  app.addHook("onSend", (_req, reply, payload, done) => {
    (reply as unknown as Record<symbol, unknown>)[REPLY_SENDING] = true;
    done(null, payload);
  });
  app.addHook("onRoute", (route) => {
    const handler = route.handler as (this: unknown, ...args: unknown[]) => unknown;
    if ((handler as unknown as Record<symbol, unknown>)[REPLY_SENDING]) return;
    const wrapped = async function (this: unknown, req: unknown, reply: FastifyReply) {
      const result = await handler.call(this, req, reply);
      if (result === undefined && replyIsSending(reply)) return reply;
      return result;
    };
    (wrapped as unknown as Record<symbol, unknown>)[REPLY_SENDING] = true;
    route.handler = wrapped as never;
  });
}

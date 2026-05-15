import type { FastifyInstance } from "fastify";
import { pushBufferedServerError } from "./error-monitor-buffer.js";

export function attachHttpErrorMonitor(app: FastifyInstance) {
  app.addHook("onResponse", async (req, reply) => {
    if (reply.statusCode < 500) return;
    pushBufferedServerError({
      message: "http_5xx",
      statusCode: reply.statusCode,
      url: req.raw.url ?? "",
      method: req.raw.method ?? "",
    });
  });
}

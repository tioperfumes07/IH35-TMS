import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { registerAccountingAuditTrailRoutes } from "./routes.js";

export default fp(async (app: FastifyInstance) => {
  await registerAccountingAuditTrailRoutes(app);
}, { name: "accounting.registerAccountingAuditTrailRoutes" });

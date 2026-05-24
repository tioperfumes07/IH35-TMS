import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { registerFactorReconciliationRoutes } from "./routes.js";

export default fp(async (app: FastifyInstance) => {
  await registerFactorReconciliationRoutes(app);
}, { name: "accounting.registerFactorReconciliationRoutes" });

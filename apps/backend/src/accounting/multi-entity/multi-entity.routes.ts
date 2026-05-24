import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { registerMultiEntityAccountingRoutes } from "./routes.js";

export default fp(async (app: FastifyInstance) => {
  await registerMultiEntityAccountingRoutes(app);
}, { name: "accounting.registerMultiEntityAccountingRoutes" });

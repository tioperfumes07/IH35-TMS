import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { registerSalesTaxRoutes } from "./routes.js";

export default fp(async (app: FastifyInstance) => {
  await registerSalesTaxRoutes(app);
}, { name: "accounting.registerSalesTaxRoutes" });

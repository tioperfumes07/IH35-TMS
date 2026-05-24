import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { registerExpenseCategoryMapRoutes } from "./routes.js";

export default fp(async (app: FastifyInstance) => {
  await registerExpenseCategoryMapRoutes(app);
}, { name: "accounting.registerExpenseCategoryMapRoutes" });

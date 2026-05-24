import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { registerCoaRolesRoutes } from "./routes.js";

export default fp(async (app: FastifyInstance) => {
  await registerCoaRolesRoutes(app);
}, { name: "accounting.registerCoaRolesRoutes" });

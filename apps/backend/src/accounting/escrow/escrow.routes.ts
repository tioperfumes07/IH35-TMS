import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { registerEscrowRoutes } from "./routes.js";

export default fp(async (app: FastifyInstance) => {
  await registerEscrowRoutes(app);
}, { name: "accounting.registerEscrowRoutes" });

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

export async function registerSettlementsRoutes(app: FastifyInstance) {
  app.get("/api/v1/settlements/:settlementId/disputes", async () => ({ ok: true }));
}

export default fp(async (app: FastifyInstance) => {
  await registerSettlementsRoutes(app);
});

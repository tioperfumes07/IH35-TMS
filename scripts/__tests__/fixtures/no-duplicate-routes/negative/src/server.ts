import type { FastifyInstance } from "fastify";
import { registerSettlementsRoutes } from "./accounting/settlements.routes";

export async function bootstrap(app: FastifyInstance) {
  await registerSettlementsRoutes(app);
}

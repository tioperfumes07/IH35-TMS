import type { FastifyInstance } from "fastify";
import { registerTrailerFleetRoutes } from "./trailer.routes.js";

export async function registerFleetTrailerRoutes(app: FastifyInstance) {
  await registerTrailerFleetRoutes(app);
}

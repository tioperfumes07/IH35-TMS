import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { registerSessionMiddleware } from "../src/auth/session-middleware.js";

export async function createIntegrationApp(register: (app: FastifyInstance) => Promise<void>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await registerSessionMiddleware(app);
  await register(app);
  await app.ready();
  return app;
}

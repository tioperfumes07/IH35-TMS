import Fastify from "fastify";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerSessionMiddleware } from "./auth/session-middleware.js";

const app = Fastify({ logger: true });

app.get("/api/v1/_healthcheck", async () => {
  return { status: "ok" };
});

async function main() {
  await registerSessionMiddleware(app);
  await registerAuthRoutes(app);
  const port = Number(process.env.PORT || 3000);
  const host = "0.0.0.0";
  try {
    await app.listen({ port, host });
    app.log.info({ port, host }, "Server started");
  } catch (err) {
    app.log.error(err, "Server failed to start");
    process.exit(1);
  }
}

main();

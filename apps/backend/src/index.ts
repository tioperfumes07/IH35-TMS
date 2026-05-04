import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerSessionMiddleware } from "./auth/session-middleware.js";
import { registerIdentityRoutes } from "./identity/routes.js";
import { registerWorkflowRoutes } from "./identity/workflow-routes.js";
import { registerMdataRoutes } from "./mdata/index.js";
import { registerMdataWorkflowRoutes } from "./mdata/workflow-routes.js";

const app = Fastify({ logger: true });

app.get("/api/v1/_healthcheck", async () => {
  return { status: "ok" };
});

async function main() {
  await app.register(cookie);
  await registerSessionMiddleware(app);
  await registerAuthRoutes(app);
  await registerIdentityRoutes(app);
  await registerWorkflowRoutes(app);
  await registerMdataRoutes(app);
  await registerMdataWorkflowRoutes(app);
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

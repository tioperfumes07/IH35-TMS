import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerSessionMiddleware } from "./auth/session-middleware.js";
import { registerIdentityRoutes } from "./identity/routes.js";
import { registerWorkflowRoutes } from "./identity/workflow-routes.js";
import { registerCatalogsRoutes } from "./catalogs/index.js";
import { registerCatalogsWorkflowRoutes } from "./catalogs/workflow-routes.js";
import { registerMdataRoutes } from "./mdata/index.js";
import { registerMdataWorkflowRoutes } from "./mdata/workflow-routes.js";

const app = Fastify({ logger: true });
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? "https://ih35-tms-web.onrender.com,http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.get("/api/v1/_healthcheck", async () => {
  return { status: "ok" };
});

async function main() {
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS: origin not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  await app.register(cookie);
  await registerSessionMiddleware(app);
  await registerAuthRoutes(app);
  await registerIdentityRoutes(app);
  await registerWorkflowRoutes(app);
  await registerMdataRoutes(app);
  await registerMdataWorkflowRoutes(app);
  await registerCatalogsRoutes(app);
  await registerCatalogsWorkflowRoutes(app);
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

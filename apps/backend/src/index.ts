import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { registerPhoneAuthRoutes } from "./auth/phone-routes.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerSessionMiddleware } from "./auth/session-middleware.js";
import { registerIdentityRoutes } from "./identity/users.routes.js";
import { registerWorkflowRoutes } from "./identity/workflow-routes.js";
import { registerCatalogsRoutes } from "./catalogs/index.js";
import { registerCatalogRegistryRoutes } from "./catalogs/catalog-registry.routes.js";
import { registerFileCategoriesRoutes } from "./catalogs/file-categories.routes.js";
import { registerDriverLoadStatusRoutes } from "./catalogs/driver-load-statuses.routes.js";
import { registerEquipmentTypeRoutes } from "./catalogs/equipment-types.routes.js";
import { registerStatesRoutes } from "./catalogs/states.routes.js";
import { registerCatalogsWorkflowRoutes } from "./catalogs/workflow-routes.js";
import { registerDocsFilesRoutes } from "./docs/files.routes.js";
import { registerDriverProfileRoutes } from "./mdata/driver-profile.routes.js";
import { registerDriverReturningDetectionRoutes } from "./mdata/driver-returning-detection.routes.js";
import { registerDriverSafetyEventsRoutes } from "./mdata/driver-safety-events.routes.js";
import { registerDispatcherSafetyEventsRoutes } from "./mdata/dispatcher-safety-events.routes.js";
import { registerCustomerContactRoutes } from "./mdata/customer-contacts.routes.js";
import { registerCustomerQualityEventsRoutes } from "./mdata/customer-quality-events.routes.js";
import { registerMdataRoutes } from "./mdata/index.js";
import { registerMdataWorkflowRoutes } from "./mdata/workflow-routes.js";
import { registerCompanyRoutes } from "./org/companies.routes.js";

type CorsOriginValue = string | boolean | RegExp | Array<string | boolean | RegExp>;

const app = Fastify({ logger: true });
const ALLOWED_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS ??
  "https://ih35-tms-web.onrender.com,https://ih35-tms-driver.onrender.com,http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

// Required for BT-1-AUTH-DRIVER phone auth:
// - TWILIO_ACCOUNT_SID
// - TWILIO_AUTH_TOKEN
// - TWILIO_VERIFY_SERVICE_SID

app.get("/api/v1/_healthcheck", async () => {
  return { status: "ok" };
});

async function main() {
  await app.register(cors, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow: CorsOriginValue) => void) => {
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
  await registerPhoneAuthRoutes(app);
  await registerIdentityRoutes(app);
  await registerWorkflowRoutes(app);
  await registerMdataRoutes(app);
  await registerDriverProfileRoutes(app);
  await registerDriverReturningDetectionRoutes(app);
  await registerDriverSafetyEventsRoutes(app);
  await registerDispatcherSafetyEventsRoutes(app);
  await registerCustomerContactRoutes(app);
  await registerCustomerQualityEventsRoutes(app);
  await registerMdataWorkflowRoutes(app);
  await registerCatalogsRoutes(app);
  await registerCatalogRegistryRoutes(app);
  await registerEquipmentTypeRoutes(app);
  await registerDriverLoadStatusRoutes(app);
  await registerStatesRoutes(app);
  await registerCatalogsWorkflowRoutes(app);
  await registerFileCategoriesRoutes(app);
  await registerDocsFilesRoutes(app);
  await registerCompanyRoutes(app);
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

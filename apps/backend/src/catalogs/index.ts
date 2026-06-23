import type { FastifyInstance } from "fastify";
import { registerAccountRoleBindingRoutes } from "./account-role-bindings.routes.js";
import { registerAccountRoutes } from "./accounts.routes.js";
import { registerClassRoutes } from "./classes.routes.js";
import { registerFmcsaRoutes } from "./fmcsa.routes.js";
import { registerItemRoutes } from "./items.routes.js";
import { registerPaymentTermsRoutes } from "./payment-terms.routes.js";
import { registerPostingTemplateRoutes } from "./posting-templates.routes.js";
import { registerWoCancellationReasonRoutes } from "./wo-cancellation-reasons.routes.js";

export async function registerCatalogsRoutes(app: FastifyInstance) {
  await registerWoCancellationReasonRoutes(app);
  await registerAccountRoutes(app);
  await registerClassRoutes(app);
  await registerItemRoutes(app);
  await registerPaymentTermsRoutes(app);
  await registerPostingTemplateRoutes(app);
  await registerAccountRoleBindingRoutes(app);
  await registerFmcsaRoutes(app);
}

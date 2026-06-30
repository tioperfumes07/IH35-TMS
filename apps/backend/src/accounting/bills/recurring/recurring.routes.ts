// Autoload wrapper for the recurring-bill-templates HTTP surface.
//
// The handler definitions live in ./routes.ts, which is NOT named `*.routes.ts`
// and therefore is never picked up by the accounting autoloader
// (matchFilter /\.routes\.(ts|js)$/ in accounting/index.ts). Without this wrapper
// the entire recurring-bill feature (table + generator + cron already exist) has
// no HTTP surface and the wired FE pages 404. This file matches the autoload
// filter and registers the handlers — mirroring accounting/escrow/escrow.routes.ts.
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import recurringBillRoutes from "./routes.js";

export default fp(async (app: FastifyInstance) => {
  await app.register(recurringBillRoutes);
}, { name: "accounting.registerRecurringBillRoutes" });

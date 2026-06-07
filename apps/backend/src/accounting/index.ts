import autoload from "@fastify/autoload";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeCollectionsSyncCron } from "../cron/collections-sync.cron.js";
import recurringBillRoutes from "./bills/recurring/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function registerAccountingRoutes(app: FastifyInstance) {
  await app.register(autoload, {
    dir: __dirname,
    matchFilter: /\.routes\.(ts|js)$/,
    // Prevent autoload from treating this module as a folder index plugin.
    indexPattern: /^autoload-index-disabled$/,
    ignorePattern: /\.test\./,
  });
  // GAP-20: recurring bills routes (not autoloaded — file is named routes.ts not *.routes.ts)
  await app.register(recurringBillRoutes);
}

export function initializeAccountingCrons(app: FastifyInstance) {
  initializeCollectionsSyncCron(app);
}

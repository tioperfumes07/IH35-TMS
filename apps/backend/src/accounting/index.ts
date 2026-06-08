import autoload from "@fastify/autoload";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeCollectionsSyncCron } from "../cron/collections-sync.cron.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function registerAccountingRoutes(app: FastifyInstance) {
  await app.register(autoload, {
    dir: __dirname,
    matchFilter: /\.routes\.(ts|js)$/,
    // Prevent autoload from treating this module as a folder index plugin.
    indexPattern: /^autoload-index-disabled$/,
    ignorePattern: /\.test\./,
  });
}

export function initializeAccountingCrons(app: FastifyInstance) {
  initializeCollectionsSyncCron(app);
}

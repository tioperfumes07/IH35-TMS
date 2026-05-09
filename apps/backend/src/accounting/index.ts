import type { FastifyInstance } from "fastify";
import { registerInvoiceRoutes } from "./invoices.routes.js";
import { registerInvoiceLineRoutes } from "./invoice-lines.routes.js";

export async function registerAccountingRoutes(app: FastifyInstance) {
  await registerInvoiceRoutes(app);
  await registerInvoiceLineRoutes(app);
}

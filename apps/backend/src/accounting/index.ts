import type { FastifyInstance } from "fastify";
import { registerInvoiceRoutes } from "./invoices.routes.js";
import { registerInvoiceLineRoutes } from "./invoice-lines.routes.js";
import { registerPaymentsRoutes } from "./payments.routes.js";
import { registerPaymentApplicationsRoutes } from "./payment-applications.routes.js";
import { registerFactoringAdvancesRoutes } from "./factoring-advances.routes.js";
import { registerBillsRoutes } from "./bills.routes.js";
import { registerJournalEntryRoutes } from "./journal-entries.routes.js";

export async function registerAccountingRoutes(app: FastifyInstance) {
  await registerInvoiceRoutes(app);
  await registerInvoiceLineRoutes(app);
  await registerPaymentsRoutes(app);
  await registerPaymentApplicationsRoutes(app);
  await registerFactoringAdvancesRoutes(app);
  await registerBillsRoutes(app);
  await registerJournalEntryRoutes(app);
}

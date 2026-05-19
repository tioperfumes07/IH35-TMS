import type { FastifyInstance } from "fastify";
import { registerInvoiceRoutes } from "./invoices.routes.js";
import { registerAccountingInvoiceHtmlRoutes } from "./invoice-render.routes.js";
import { registerInvoiceLineRoutes } from "./invoice-lines.routes.js";
import { registerPaymentsRoutes } from "./payments.routes.js";
import { registerPaymentApplicationsRoutes } from "./payment-applications.routes.js";
import { registerCustomerPaymentsRoutes } from "./customer-payments.routes.js";
import { registerVendorBillPaymentsRoutes } from "./vendor-bill-payments.routes.js";
import { registerFactoringAdvancesRoutes } from "./factoring-advances.routes.js";
import { registerBillsRoutes } from "./bills.routes.js";
import { registerJournalEntryRoutes } from "./journal-entries.routes.js";
import { registerExpenseLoadLookupRoutes } from "./load-lookup.routes.js";
import { registerExpenseRoutes } from "./expenses.routes.js";
import { registerAccountingP7Wave2Routes } from "./p7-wave2.routes.js";
import { registerPostingEngineRoutes } from "./posting-engine.routes.js";

export async function registerAccountingRoutes(app: FastifyInstance) {
  await registerInvoiceRoutes(app);
  await registerAccountingInvoiceHtmlRoutes(app);
  await registerInvoiceLineRoutes(app);
  await registerPaymentsRoutes(app);
  await registerPaymentApplicationsRoutes(app);
  await registerCustomerPaymentsRoutes(app);
  await registerVendorBillPaymentsRoutes(app);
  await registerFactoringAdvancesRoutes(app);
  await registerBillsRoutes(app);
  await registerJournalEntryRoutes(app);
  await registerExpenseLoadLookupRoutes(app);
  await registerExpenseRoutes(app);
  await registerAccountingP7Wave2Routes(app);
  await registerPostingEngineRoutes(app);
}

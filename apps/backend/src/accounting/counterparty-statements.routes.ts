import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { getCustomerStatementOfAccount, getVendorStatementOfAccount, type CounterpartyStatement } from "./counterparty-statements.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { escapeHtml, formatMoney, wrapPdfDocument } from "../render/pdf-template.js";

const idParamsSchema = z.object({ id: z.string().uuid() });
const statementQuerySchema = companyQuerySchema.extend({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function canAccessStatements(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function money(cents: number) {
  return formatMoney(cents);
}

function statementBodyHtml(kind: "Customer" | "Vendor", statement: CounterpartyStatement) {
  const rows = statement.lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.date)}</td>
        <td>${escapeHtml(line.description)}</td>
        <td>${escapeHtml(line.debit_cents > 0 ? money(line.debit_cents) : "—")}</td>
        <td>${escapeHtml(line.credit_cents > 0 ? money(line.credit_cents) : "—")}</td>
        <td style="text-align:right">${escapeHtml(money(line.running_balance_cents))}</td>
      </tr>`
    )
    .join("");
  return `
    <h1>${escapeHtml(kind)} statement of account — ${escapeHtml(statement.counterparty_name)}</h1>
    <div class="meta">${escapeHtml(statement.from_date)} → ${escapeHtml(statement.to_date)}</div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Charge</th><th>Payment/Credit</th><th style="text-align:right">Balance</th></tr></thead>
      <tbody>
        <tr><td colspan="4">Opening balance</td><td style="text-align:right">${escapeHtml(money(statement.opening_balance_cents))}</td></tr>
        ${rows || `<tr><td colspan="5">No activity in this period</td></tr>`}
        <tr><th colspan="4">Closing balance</th><td style="text-align:right">${escapeHtml(money(statement.closing_balance_cents))}</td></tr>
      </tbody>
    </table>`;
}

export async function registerCounterpartyStatementRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/accounting/customers/:id/statement",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessStatements(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = statementQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);
      if (query.data.from_date > query.data.to_date) {
        return reply.code(400).send({ error: "validation_error", details: { period: ["from_date must be on or before to_date"] } });
      }
      await assertCompanyMembership(user.uuid, query.data.operating_company_id);

      const statement = await getCustomerStatementOfAccount({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        customer_id: params.data.id,
        from_date: query.data.from_date,
        to_date: query.data.to_date,
      });
      if (!statement) return reply.code(404).send({ error: "customer_not_found" });
      return reply.code(200).send(statement);
    }
  );

  app.get(
    "/api/v1/accounting/vendors/:id/statement",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessStatements(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = statementQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);
      if (query.data.from_date > query.data.to_date) {
        return reply.code(400).send({ error: "validation_error", details: { period: ["from_date must be on or before to_date"] } });
      }
      await assertCompanyMembership(user.uuid, query.data.operating_company_id);

      const statement = await getVendorStatementOfAccount({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        vendor_id: params.data.id,
        from_date: query.data.from_date,
        to_date: query.data.to_date,
      });
      if (!statement) return reply.code(404).send({ error: "vendor_not_found" });
      return reply.code(200).send(statement);
    }
  );

  // Browser-printable HTML — same canonical wrapPdfDocument pattern bill/invoice/settlement/
  // bill-payment already use (bill-payment-render.routes.ts), reused rather than reinvented.
  app.get(
    "/api/v1/accounting/customers/:id/statement.html",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessStatements(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = statementQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      const statement = await getCustomerStatementOfAccount({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        customer_id: params.data.id,
        from_date: query.data.from_date,
        to_date: query.data.to_date,
      });
      if (!statement) return reply.code(404).type("text/plain").send("customer_not_found");

      await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.customer_statement.html_viewed",
          { operating_company_id: query.data.operating_company_id, customer_id: params.data.id },
          "info",
          "V2-COUNTERPARTY-STATEMENTS"
        );
      });

      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Cache-Control", "no-store");
      return reply.send(
        wrapPdfDocument({
          title: `Statement — ${statement.counterparty_name}`,
          body: statementBodyHtml("Customer", statement),
        })
      );
    }
  );

  app.get(
    "/api/v1/accounting/vendors/:id/statement.html",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessStatements(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = statementQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      const statement = await getVendorStatementOfAccount({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        vendor_id: params.data.id,
        from_date: query.data.from_date,
        to_date: query.data.to_date,
      });
      if (!statement) return reply.code(404).type("text/plain").send("vendor_not_found");

      await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.vendor_statement.html_viewed",
          { operating_company_id: query.data.operating_company_id, vendor_id: params.data.id },
          "info",
          "V2-COUNTERPARTY-STATEMENTS"
        );
      });

      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Cache-Control", "no-store");
      return reply.send(
        wrapPdfDocument({
          title: `Statement — ${statement.counterparty_name}`,
          body: statementBodyHtml("Vendor", statement),
        })
      );
    }
  );
}

export default fp(async (app) => {
  await registerCounterpartyStatementRoutes(app);
}, { name: "accounting.registerCounterpartyStatementRoutes" });

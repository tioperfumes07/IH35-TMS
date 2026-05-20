import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import {
  exportApAgingStatement,
  exportArAgingStatement,
  exportBalanceSheetStatement,
  exportCashFlowStatement,
  exportProfitLossStatement,
  exportTrialBalanceStatement,
} from "./statement-export.service.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const pointInTimeQuerySchema = companyQuerySchema.extend({
  as_of_date: isoDateSchema.optional(),
});

const rangedQuerySchema = companyQuerySchema.extend({
  range_key: z.string().optional(),
  from_date: isoDateSchema.optional(),
  to_date: isoDateSchema.optional(),
});

function canAccessStatementExport(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function exportError(reply: FastifyReply, error: unknown) {
  const message = String((error as Error)?.message ?? "statement_export_failed");
  if (
    message === "invalid_range_key" ||
    message === "from_to_required_without_range_key" ||
    message === "custom_range_requires_from_to"
  ) {
    return reply.code(400).send({ error: message });
  }
  return reply.code(500).send({ error: "statement_export_failed" });
}

export async function registerStatementExportRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/trial-balance/export/pdf", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = pointInTimeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportTrialBalanceStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        as_of_date: query.data.as_of_date ?? todayIsoDate(),
        format: "pdf",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/trial-balance/export/xlsx", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = pointInTimeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportTrialBalanceStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        as_of_date: query.data.as_of_date ?? todayIsoDate(),
        format: "xlsx",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/profit-loss/export/pdf", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = rangedQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportProfitLossStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        range_key: query.data.range_key,
        from_date: query.data.from_date,
        to_date: query.data.to_date,
        format: "pdf",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/profit-loss/export/xlsx", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = rangedQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportProfitLossStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        range_key: query.data.range_key,
        from_date: query.data.from_date,
        to_date: query.data.to_date,
        format: "xlsx",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/balance-sheet/export/pdf", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = pointInTimeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportBalanceSheetStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        as_of_date: query.data.as_of_date ?? todayIsoDate(),
        format: "pdf",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/balance-sheet/export/xlsx", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = pointInTimeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportBalanceSheetStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        as_of_date: query.data.as_of_date ?? todayIsoDate(),
        format: "xlsx",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/cash-flow/export/pdf", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = rangedQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportCashFlowStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        range_key: query.data.range_key,
        from_date: query.data.from_date,
        to_date: query.data.to_date,
        format: "pdf",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/cash-flow/export/xlsx", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = rangedQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportCashFlowStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        range_key: query.data.range_key,
        from_date: query.data.from_date,
        to_date: query.data.to_date,
        format: "xlsx",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/ar-aging/export/pdf", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = pointInTimeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportArAgingStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        as_of_date: query.data.as_of_date ?? todayIsoDate(),
        format: "pdf",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/ar-aging/export/xlsx", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = pointInTimeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportArAgingStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        as_of_date: query.data.as_of_date ?? todayIsoDate(),
        format: "xlsx",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/ap-aging/export/pdf", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = pointInTimeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportApAgingStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        as_of_date: query.data.as_of_date ?? todayIsoDate(),
        format: "pdf",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });

  app.get("/api/v1/accounting/ap-aging/export/xlsx", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessStatementExport(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = pointInTimeQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const result = await exportApAgingStatement({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        as_of_date: query.data.as_of_date ?? todayIsoDate(),
        format: "xlsx",
      });
      reply.header("Content-Type", result.contentType);
      reply.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return reply.send(result.buffer);
    } catch (error) {
      return exportError(reply, error);
    }
  });
}

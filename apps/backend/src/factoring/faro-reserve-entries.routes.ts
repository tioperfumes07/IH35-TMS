// Lead 2026-10-02 FARO-REPORTS-ARE-THE-BANK-FEED — the Faro reserve registers (faro-reserve-entries.service.ts).
//   POST /api/v1/factoring/faro-reserve-report/preview  { operating_company_id, register, csv_text }   validates, writes nothing
//   POST /api/v1/factoring/faro-reserve-report/commit   { same }                Owner only — the owner runs the import
//   GET  /api/v1/factoring/faro-reserve-entries?operating_company_id=&register=escrow|cash
//   GET  /api/v1/factoring/faro-reserve-entries/:id?operating_company_id=      (register of one entry — JE drill-back)
//   POST /api/v1/factoring/faro-reserve-entries/:id/post { operating_company_id }   Owner / Administrator / Accountant
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import {
  FaroReserveError,
  commitFaroReserveImport,
  getFaroReserveEntry,
  registerBankAccountId,
  listFaroReserveEntries,
  postFaroReserveEntryOnClient,
  previewFaroReserveImport,
} from "./faro-reserve-entries.service.js";
import { InterestAccrualError } from "./interest-accrual.service.js";
import { SHORT_PAY_REASONS, ShortPayResolutionError, resolveFaroShortPay, type ShortPayReason } from "./short-pay-resolution.service.js";

const POSTERS = new Set(["Owner", "Administrator", "Accountant"]);
const register = z.enum(["escrow", "cash"]);
const reportBody = z.object({
  operating_company_id: z.string().uuid(),
  register,
  csv_text: z.string().min(1).max(2_000_000),
});
const listQ = z.object({ operating_company_id: z.string().uuid(), register });
const companyQ = z.object({ operating_company_id: z.string().uuid() });
const postBody = z.object({ operating_company_id: z.string().uuid() });
const idParams = z.object({ id: z.string().uuid() });

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof ShortPayResolutionError) {
    return reply.code(err.code === "short_pay_resolution_owner_only" ? 403 : err.code === "faro_entry_not_found" ? 404 : 409).send({ error: err.code });
  }
  if (err instanceof InterestAccrualError) return reply.code(409).send({ error: err.code });
  if (err instanceof FaroReserveError) {
    return reply.code(err.code === "faro_entry_not_found" ? 404 : err.code.startsWith("faro_report_") ? 400 : 409).send({ error: err.code });
  }
  throw err;
}

const shortPayBody = z.object({
  operating_company_id: z.string().uuid(),
  resolution: z.enum(["written_down", "kept_open"]),
  reason: z.enum(Object.keys(SHORT_PAY_REASONS) as [ShortPayReason, ...ShortPayReason[]]).nullish(),
  note: z.string().trim().max(500).nullish(),
});

export async function registerFaroReserveEntryRoutes(app: FastifyInstance) {
  // Owner ruling 2026-10-02 — the customer side of a Faro short-pay: write it down to a reason (credit memo + DR reason /
  // CR A/R, shared spine link with the reserve entry) or keep it open on the customer. Owner only.
  app.post("/api/v1/factoring/faro-reserve-entries/:id/short-pay-resolution", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "short_pay_resolution_owner_only" });
    const p = idParams.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const b = shortPayBody.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    try {
      return await withCompanyScope(user.uuid, b.data.operating_company_id, (c) =>
        resolveFaroShortPay(c, {
          operating_company_id: b.data.operating_company_id,
          entry_id: p.data.id,
          resolution: b.data.resolution,
          reason: b.data.reason ?? null,
          note: b.data.note ?? null,
          actor_user_id: user.uuid,
          actor_role: String(user.role ?? ""),
        })
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/api/v1/factoring/faro-reserve-report/preview", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const b = reportBody.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    try {
      return await withCompanyScope(user.uuid, b.data.operating_company_id, (c) =>
        registerBankAccountId(c, b.data.operating_company_id, b.data.register).then((bankAccountId) =>
          previewFaroReserveImport(c, b.data.operating_company_id, bankAccountId, b.data.csv_text)
        )
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/api/v1/factoring/faro-reserve-report/commit", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // The owner closes purchases and runs this import himself (Lead 2026-10-02). Nobody else writes Faro's report in.
    if (user.role !== "Owner") return reply.code(403).send({ error: "faro_reserve_import_owner_only" });
    const b = reportBody.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    try {
      return await withCompanyScope(user.uuid, b.data.operating_company_id, (c) =>
        registerBankAccountId(c, b.data.operating_company_id, b.data.register).then((bankAccountId) =>
          commitFaroReserveImport(c, {
            operating_company_id: b.data.operating_company_id,
            bank_account_id: bankAccountId,
            text: b.data.csv_text,
            actor_user_id: user.uuid,
          })
        )
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/api/v1/factoring/faro-reserve-entries", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = listQ.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    try {
      return await withCompanyScope(user.uuid, q.data.operating_company_id, async (c) => {
        const bankAccountId = await registerBankAccountId(c, q.data.operating_company_id, q.data.register);
        return { bank_account_id: bankAccountId, rows: await listFaroReserveEntries(c, q.data.operating_company_id, bankAccountId) };
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/api/v1/factoring/faro-reserve-entries/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = idParams.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const q = companyQ.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    try {
      return await withCompanyScope(user.uuid, q.data.operating_company_id, (c) => getFaroReserveEntry(c, q.data.operating_company_id, p.data.id));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/api/v1/factoring/faro-reserve-entries/:id/post", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!POSTERS.has(String(user.role ?? ""))) return reply.code(403).send({ error: "faro_reserve_post_restricted" });
    const p = idParams.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const b = postBody.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    try {
      return await withCompanyScope(user.uuid, b.data.operating_company_id, (c) =>
        postFaroReserveEntryOnClient(c, {
          operating_company_id: b.data.operating_company_id,
          entry_id: p.data.id,
          actor_user_id: user.uuid,
          actor_role: String(user.role ?? ""),
        })
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });
}

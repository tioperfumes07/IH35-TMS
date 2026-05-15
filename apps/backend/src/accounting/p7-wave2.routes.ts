import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import crypto from "node:crypto";
import { insertRetainedEarningsClosingJournalIfNeeded } from "./period-close-retained-earnings.service.js";

const financeRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

function finance(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!financeRoles.has(String(user.role))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { uuid: string; role: string };
}

function payloadHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function mapPgClosedPeriod(reply: { code: (c: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  const msg = String((err as Error)?.message ?? err ?? "");
  if (msg.includes("IH35_CLOSED_PERIOD")) {
    reply.code(423).send({
      error: "period_locked",
      message: msg,
    });
    return true;
  }
  return false;
}

export async function registerAccountingP7Wave2Routes(app: FastifyInstance) {
  app.get("/api/v1/accounting/sync-conflicts", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;

    const q = companyQuerySchema
      .extend({
        status: z.enum(["unresolved", "resolved"]).optional(),
        severity: z.enum(["low", "medium", "high"]).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional().default(50),
        cursor: z.coerce.number().int().min(0).optional(),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    const offset = q.data.cursor ?? 0;
    const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const params: unknown[] = [q.data.operating_company_id];
      let where = `operating_company_id = $1`;
      if (q.data.status === "unresolved") {
        where += ` AND resolved_at IS NULL`;
      } else if (q.data.status === "resolved") {
        where += ` AND resolved_at IS NOT NULL`;
      }
      if (q.data.severity) {
        params.push(q.data.severity);
        where += ` AND severity = $${params.length}`;
      }
      params.push(q.data.limit);
      params.push(offset);
      const lim = params.length - 1;
      const off = params.length;
      const res = await client.query(
        `
          SELECT id, entity_type, entity_id, severity, detected_at, resolved_at, resolution
          FROM integrations.qbo_sync_conflicts
          WHERE ${where}
          ORDER BY detected_at DESC
          LIMIT $${lim} OFFSET $${off}
        `,
        params
      );
      await appendCrudAudit(client, user.uuid, "accounting.sync_conflicts_list", { cursor: offset }, "info", "P7-W2-ACC");
      return res.rows;
    });

    return { items: rows };
  });

  app.get("/api/v1/accounting/sync-conflicts/:id", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const q = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !q.success) return reply.code(400).send({ error: "validation_error" });

    const row = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const res = await client.query(`SELECT * FROM integrations.qbo_sync_conflicts WHERE id = $1 AND operating_company_id = $2`, [
        params.data.id,
        q.data.operating_company_id,
      ]);
      await appendCrudAudit(client, user.uuid, "accounting.sync_conflict_detail", { id: params.data.id }, "info", "P7-W2-ACC");
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.post("/api/v1/accounting/sync-conflicts/:id/resolve", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        resolution: z.enum(["qbo_wins", "tms_wins", "manual_merge", "dismissed"]),
        notes: z.string().optional(),
      })
      .safeParse(req.body ?? {});
    if (!params.success || !body.success) return validationError(reply, params.success ? body.error! : params.error);

    await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(`SELECT * FROM integrations.qbo_sync_conflicts WHERE id = $1 LIMIT 1`, [params.data.id]);
      const c = res.rows[0];
      if (!c || String(c.operating_company_id) !== body.data.operating_company_id) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      await client.query(
        `
          UPDATE integrations.qbo_sync_conflicts
          SET
            resolved_at = now(),
            resolution = $2,
            resolved_by_user_id = $3::uuid,
            resolution_notes = $4,
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [params.data.id, body.data.resolution, user.uuid, body.data.notes ?? null]
      );

      if (body.data.resolution === "tms_wins") {
        const et = String(c.entity_type ?? "").toLowerCase();
        const mapQueueType = (t: string): "invoice" | "bill" | "journal_entry" | null => {
          if (t === "invoice") return "invoice";
          if (t === "bill") return "bill";
          if (t === "journal_entry") return "journal_entry";
          return null;
        };
        const qt = mapQueueType(et);
        if (qt) {
          await enqueueSyncJob(body.data.operating_company_id, qt, String(c.entity_id), payloadHash({ conflict_id: c.id }), user.uuid);
        }
      }

      await appendCrudAudit(client, user.uuid, "accounting.sync_conflict_resolved", { conflict_id: params.data.id, resolution: body.data.resolution }, "info", "P7-W2-ACC");
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
        "notification.owner.sync_conflict",
        "warning",
        JSON.stringify({ conflict_id: params.data.id, resolution: body.data.resolution }),
        user.uuid,
        "P7-W2-ACC",
      ]);
    });
    if (reply.sent) return;
    return { ok: true };
  });

  app.post("/api/v1/accounting/periods", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;

    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        period_start: z.string(),
        period_end: z.string(),
        fiscal_year: z.coerce.number().int(),
        period_label: z.string().optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const row = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const ins = await client.query(
          `
            INSERT INTO accounting.periods (
              operating_company_id, period_start, period_end, fiscal_year, period_label, status
            )
            VALUES ($1::uuid, $2::date, $3::date, $4::int, $5, 'open')
            RETURNING id
          `,
          [
            body.data.operating_company_id,
            body.data.period_start,
            body.data.period_end,
            body.data.fiscal_year,
            body.data.period_label ?? null,
          ]
        );
        const pid = (ins.rows[0] as { id?: string } | undefined)?.id;
        await appendCrudAudit(client, user.uuid, "accounting.period_created", { id: pid }, "info", "P7-W2-ACC");
        return pid ? { id: pid } : undefined;
      });
      return reply.code(201).send({ id: row?.id });
    } catch (err) {
      if (mapPgClosedPeriod(reply, err)) return;
      throw err;
    }
  });

  app.post("/api/v1/accounting/periods/:id/close", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z.object({ operating_company_id: z.string().uuid(), closing_notes: z.string().optional() }).safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    let retainedEarningsJeId: string | null = null;

    try {
      await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        await client.query("BEGIN");
        try {
          const periodRes = await client.query(
            `
              SELECT id, period_start::text, period_end::text, fiscal_year, status::text
              FROM accounting.periods
              WHERE id = $1 AND operating_company_id = $2
              FOR UPDATE
            `,
            [params.data.id, body.data.operating_company_id]
          );
          const period = periodRes.rows[0] as
            | { period_start: string; period_end: string; fiscal_year: number; status: string }
            | undefined;
          if (!period) {
            await client.query("ROLLBACK");
            throw new Error("period_not_found");
          }
          if (period.status !== "open") {
            await client.query("ROLLBACK");
            throw new Error("period_not_open");
          }

          retainedEarningsJeId = await insertRetainedEarningsClosingJournalIfNeeded(client, {
            operating_company_id: body.data.operating_company_id,
            period_start: period.period_start,
            period_end: period.period_end,
            fiscal_year: Number(period.fiscal_year),
            closer_user_id: user.uuid,
          });

          const upd = await client.query(
            `
              UPDATE accounting.periods
              SET status = 'closed',
                  closed_at = now(),
                  closed_by_user_id = $3::uuid,
                  closing_notes = $4,
                  locks_txn_dates_le = period_end,
                  retained_earnings_entry_id = COALESCE($5::uuid, retained_earnings_entry_id),
                  updated_at = now()
              WHERE id = $1 AND operating_company_id = $2 AND status = 'open'
              RETURNING id
            `,
            [params.data.id, body.data.operating_company_id, user.uuid, body.data.closing_notes ?? null, retainedEarningsJeId]
          );

          if (!upd.rows.length) {
            await client.query("ROLLBACK");
            throw new Error("period_close_race");
          }

          await appendCrudAudit(client, user.uuid, "accounting.period_closed", { period_id: params.data.id, retained_earnings_entry_id: retainedEarningsJeId }, "info", "P7-W2-ACC");

          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw err;
        }
      });

      if (retainedEarningsJeId) {
        await enqueueSyncJob(
          body.data.operating_company_id,
          "journal_entry",
          retainedEarningsJeId,
          payloadHash({ retained_earnings_close: params.data.id }),
          user.uuid
        );
      }

      return { ok: true, retained_earnings_entry_id: retainedEarningsJeId };
    } catch (err) {
      const msg = String((err as Error)?.message ?? err ?? "");
      if (msg === "period_not_found") return reply.code(404).send({ error: "not_found" });
      if (msg === "period_not_open") return reply.code(409).send({ error: "period_not_open" });
      if (msg === "period_close_race") return reply.code(409).send({ error: "period_close_race" });
      if (mapPgClosedPeriod(reply, err)) return;
      throw err;
    }
  });

  app.post("/api/v1/accounting/periods/:id/reopen", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z.object({ operating_company_id: z.string().uuid(), reason: z.string().min(1) }).safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      await client.query(
        `
          UPDATE accounting.periods
          SET status = 'open',
              closed_at = NULL,
              closed_by_user_id = NULL,
              locks_txn_dates_le = NULL,
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
        `,
        [params.data.id, body.data.operating_company_id]
      );
      await appendCrudAudit(client, user.uuid, "accounting.period_reopened", { period_id: params.data.id, reason: body.data.reason }, "warning", "P7-W2-ACC");
    });
    return { ok: true };
  });

  app.get("/api/v1/accounting/reports/trial-balance", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;

    const q = companyQuerySchema.extend({ as_of: z.string().optional() }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            jep.account_id,
            a.account_number,
            a.account_name,
            a.account_type,
            SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END)::bigint AS debit_cents,
            SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END)::bigint AS credit_cents
          FROM accounting.journal_entry_postings jep
          JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
          JOIN catalogs.accounts a ON a.id = jep.account_id
          WHERE jep.operating_company_id = $1
            AND ($2::date IS NULL OR je.entry_date <= $2::date)
          GROUP BY jep.account_id, a.account_number, a.account_name, a.account_type
          ORDER BY a.account_number NULLS LAST, a.account_name
        `,
        [q.data.operating_company_id, q.data.as_of ?? null]
      );
      await appendCrudAudit(client, user.uuid, "accounting.report_trial_balance", { as_of: q.data.as_of ?? null }, "info", "P7-W2-ACC");
      return res.rows;
    });

    return { as_of: q.data.as_of ?? null, accounts: rows };
  });

  app.get("/api/v1/accounting/sales-tax-summary", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;

    const q = companyQuerySchema.extend({ start: z.string(), end: z.string() }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            COALESCE(SUM(inv.subtotal_cents), 0)::bigint AS taxable_subtotal_cents,
            COALESCE(SUM(inv.tax_cents), 0)::bigint AS tax_collected_cents,
            COUNT(*)::int AS invoice_count
          FROM accounting.invoices inv
          WHERE inv.operating_company_id = $1
            AND inv.issue_date BETWEEN $2::date AND $3::date
            AND inv.voided_at IS NULL
        `,
        [q.data.operating_company_id, q.data.start, q.data.end]
      );
      await appendCrudAudit(client, user.uuid, "accounting.sales_tax_summary", { start: q.data.start, end: q.data.end }, "info", "P7-W2-ACC");
      return res.rows;
    });

    return { summary: rows[0] ?? null };
  });

  app.get("/api/v1/accounting/1099-summary", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;

    const q = companyQuerySchema.extend({ year: z.coerce.number().int() }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            bp.vendor_id,
            v.vendor_name,
            SUM(bp.amount_cents)::bigint AS payments_cents
          FROM accounting.bill_payments bp
          LEFT JOIN mdata.vendors v
            ON v.operating_company_id = bp.operating_company_id
            AND (v.id::text = trim(bp.vendor_id) OR v.vendor_code = trim(bp.vendor_id))
          WHERE bp.operating_company_id = $1
            AND EXTRACT(YEAR FROM bp.payment_date)::int = $2
            AND bp.revoked_at IS NULL
            AND bp.vendor_id IS NOT NULL
            AND COALESCE(v.eligible_1099, false) = true
          GROUP BY bp.vendor_id, v.vendor_name
          HAVING SUM(bp.amount_cents) >= 60000
        `,
        [q.data.operating_company_id, q.data.year]
      );
      await appendCrudAudit(client, user.uuid, "accounting.report_1099_summary", { year: q.data.year }, "info", "P7-W2-ACC");
      return res.rows;
    });

    return { vendors: rows };
  });

  app.post("/api/v1/accounting/1099-corrections", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;

    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        vendor_id: z.string().uuid(),
        year: z.coerce.number().int(),
        override_amount_cents: z.coerce.number().int(),
        reason: z.string().min(1),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      await appendCrudAudit(client, user.uuid, "accounting.form_1099_correction_requested", body.data as Record<string, unknown>, "warning", "P7-W2-ACC");
    });

    return reply.code(501).send({ error: "not_implemented", note: "corrections ledger table pending" });
  });

  app.get("/api/v1/accounting/1099-forms/:vendor_id", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;

    const params = z.object({ vendor_id: z.string().uuid() }).safeParse(req.params ?? {});
    const q = companyQuerySchema.extend({ year: z.coerce.number().int() }).safeParse(req.query ?? {});
    if (!params.success || !q.success) return reply.code(400).send({ error: "validation_error" });

    await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      await appendCrudAudit(client, user.uuid, "accounting.form_1099_pdf_requested", { vendor_id: params.data.vendor_id, year: q.data.year }, "info", "P7-W2-ACC");
    });

    return reply.code(501).send({ error: "pdf_not_implemented" });
  });
}

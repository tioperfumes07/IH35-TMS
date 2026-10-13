/**
 * Relay fuel-transaction webhook receiver (10-02 CC-2 queue item 5; Lead ROUND 353).
 *
 * A fill pushed by Relay lands the moment it arrives instead of at the next 07:00 pull. It takes EXACTLY the pull's
 * path — ingestForCompany (relay-fuel-ingest.cron.ts) with source "webhook", then the same after-commit flushes —
 * so the webhook changes arrival time, never the posting rule: posting stays on the Banking match / categorization,
 * and every gate the pull honours (RELAY_FUEL_INGEST_ENABLED, EXPENSE_GL_POSTING_ENABLED, the overage flags) applies.
 *
 * Relay has not published a webhook contract (Lead ROUND 310), so this receiver defines ours:
 *   POST /api/v1/integrations/relay/webhook?entity=<company code, e.g. USMCA>
 *   x-relay-timestamp: <unix seconds>
 *   x-relay-signature: hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))   ("sha256=" prefix accepted)
 *   body: one Relay transaction object, an array of them, or { transactions: [...] } / { data: [...] }
 * The secret is per company: env RELAY_WEBHOOK_SECRET_<CODE>. No secret configured -> 503 and nothing is accepted;
 * a bad or stale signature -> 401 and nothing is parsed or stored (reject before persist, same as the Samsara receiver).
 * Replays are harmless: upsertRelayFuelTransaction is keyed on the Relay transaction id.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { flushFuelGlPostsAfterCommit, type FuelTxnGlPostCandidate } from "../../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";
import { flushFuelCardOverageAfterCommit } from "../../fuel/fuel-card-overage.service.js";
import { ingestForCompany } from "./relay-fuel-ingest.cron.js";
import type { RelayFuelTransaction } from "./relay-client.js";
import { RELAY_USMCA_DATA_FLOOR, USMCA_OPERATING_COMPANY_ID } from "./relay-usmca-date-floor.js";

export const RELAY_WEBHOOK_PATH = "/api/v1/integrations/relay/webhook";
const AUDIT_SOURCE = "RELAY-FUEL-WEBHOOK";
/** A signed request older (or newer) than this is refused — a captured request cannot be replayed later. */
export const RELAY_WEBHOOK_MAX_SKEW_SECONDS = 300;
const MAX_ROWS = 500;

const querySchema = z.object({ entity: z.string().trim().min(2).max(20) });

export type RelayWebhookVerify = { ok: true } | { ok: false; reason: "no_secret" | "missing_headers" | "stale" | "bad_signature" };

/** Pure: verify the signature over the RAW body. Exported for the unit test and the guard. */
export function verifyRelayWebhookSignature(
  rawBody: Buffer,
  secret: string | null | undefined,
  headers: Record<string, string | string[] | undefined>,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): RelayWebhookVerify {
  if (!secret) return { ok: false, reason: "no_secret" };
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  const ts = one(headers["x-relay-timestamp"]);
  const sig = one(headers["x-relay-signature"]).replace(/^sha256=/i, "");
  if (!ts || !sig || !/^\d+$/.test(ts) || !/^[0-9a-f]+$/i.test(sig)) return { ok: false, reason: "missing_headers" };
  if (Math.abs(nowSeconds - Number(ts)) > RELAY_WEBHOOK_MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };
  const expected = createHmac("sha256", secret).update(`${ts}.`).update(rawBody).digest();
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

/** Pure: the transaction rows in any of the accepted body shapes. */
export function extractRelayWebhookRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    for (const key of ["transactions", "data"]) {
      if (Array.isArray(o[key])) return extractRelayWebhookRows(o[key]);
    }
    return [o];
  }
  return [];
}

/**
 * ROUND 443.21 (owner, 2026-10-10): "in usmca we put in transportation env key. we only use transportation, we do not
 * use relay usmca." Relay registers one webhook per Relay ACCOUNT -- ?entity=TRANSP for IH 35 TRANSPORTATION LLC (the
 * only account in use) and ?entity=USMCA -- and every fill on that account from 2026-08-03 on is USMCA's. The entity
 * selects which secret verifies the request (unchanged); THIS decides where a verified fill is stored. Both accounts
 * store under USMCA -- the only company whose Relay fills are stored (ROUND 443.15) -- so a fill that also arrives by
 * the cron pull is the same (operating_company_id, transaction_id) row, never a second one. Any other entity maps to
 * itself and the writer refuses it.
 */
export const RELAY_WEBHOOK_ACCOUNT_STORAGE: Readonly<Record<string, string>> = Object.freeze({
  TRANSP: USMCA_OPERATING_COMPANY_ID,
  USMCA: USMCA_OPERATING_COMPANY_ID,
});

/** Pure: the company a verified delivery to ?entity=<code> is stored under. */
export function relayWebhookStorageCompanyId(entityCode: string, entityCompanyId: string): string {
  return RELAY_WEBHOOK_ACCOUNT_STORAGE[entityCode.toUpperCase()] ?? entityCompanyId;
}

/** Pure: split rows into those USMCA may store and those dated before the USMCA Relay floor (refused by name). */
export function splitRelayRowsAtUsmcaFloor(
  rows: Record<string, unknown>[],
  storageCompanyId: string
): { keep: Record<string, unknown>[]; beforeFloor: { transaction_id: string; fill_day: string }[] } {
  if (storageCompanyId !== USMCA_OPERATING_COMPANY_ID) return { keep: rows, beforeFloor: [] };
  const keep: Record<string, unknown>[] = [];
  const beforeFloor: { transaction_id: string; fill_day: string }[] = [];
  for (const r of rows) {
    const day = String(r.created_at ?? r.createdAt ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < RELAY_USMCA_DATA_FLOOR) {
      beforeFloor.push({ transaction_id: String(r.transaction_id ?? r.id ?? ""), fill_day: day });
    } else {
      keep.push(r);
    }
  }
  return { keep, beforeFloor };
}

function companySecret(code: string): string | null {
  const v = process.env[`RELAY_WEBHOOK_SECRET_${code.toUpperCase()}`]?.trim();
  return v ? v : null;
}

async function audit(companyId: string | null, eventClass: string, severity: string, payload: Record<string, unknown>) {
  await withLuciaBypass(async (client) => {
    if (companyId) await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      eventClass,
      severity,
      JSON.stringify(payload),
      AUDIT_SOURCE,
    ]);
  });
}

async function handleRelayWebhook(req: FastifyRequest, reply: FastifyReply) {
  const arrivedAt = new Date().toISOString();
  const q = querySchema.safeParse(req.query ?? {});
  if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) return reply.code(400).send({ error: "invalid_body" });

  const code = q.data.entity.toUpperCase();
  const company = await withLuciaBypass(async (client) => {
    const r = await client.query<{ id: string; code: string }>(
      `SELECT id::text, code FROM org.companies WHERE upper(code) = $1 AND is_active = true AND deactivated_at IS NULL LIMIT 1`,
      [code]
    );
    return r.rows[0] ?? null;
  });
  if (!company) return reply.code(404).send({ error: "relay_webhook_unknown_entity" });

  // REJECT BEFORE PERSIST: nothing below this line runs for an unsigned, wrongly signed or stale request.
  const secret = companySecret(company.code);
  const verify = verifyRelayWebhookSignature(rawBody, secret, req.headers as Record<string, string | string[] | undefined>);
  if (!verify.ok) {
    await audit(company.id, "integrations.relay_fuel_webhook_rejected", "warning", {
      operating_company_id: company.id,
      reason: verify.reason,
      bytes: rawBody.length,
    }).catch((err) => req.log.warn({ err }, "relay_webhook_reject_audit_failed"));
    if (verify.reason === "no_secret") return reply.code(503).send({ error: "relay_webhook_not_configured" });
    return reply.code(401).send({ error: "unauthorized" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return reply.code(400).send({ error: "invalid_json" });
  }
  const allRows = extractRelayWebhookRows(payload);
  if (allRows.length === 0) return reply.code(400).send({ error: "no_transactions" });
  if (allRows.length > MAX_ROWS) return reply.code(413).send({ error: "too_many_transactions", max: MAX_ROWS });

  // ROUND 443.21: verified with the ENTITY's secret above; stored under the company that owns that Relay account's fills.
  const storageCompanyId = relayWebhookStorageCompanyId(company.code, company.id);
  const storageCode = storageCompanyId === USMCA_OPERATING_COMPANY_ID ? "USMCA" : company.code;

  const flagOn = await withLuciaBypass((client) =>
    isEnabled(client, "RELAY_FUEL_INGEST_ENABLED", { operating_company_id: storageCompanyId })
  );
  if (!flagOn) {
    // Same gate as the pull: a company not ingesting Relay does not ingest by push either. 200 so Relay does not retry.
    await audit(storageCompanyId, "integrations.relay_fuel_webhook_ignored_flag_off", "info", {
      operating_company_id: storageCompanyId,
      received_entity: company.code,
      received: allRows.length,
    });
    return reply.code(200).send({ ok: true, status: "ignored_flag_off", received: allRows.length, arrived_at: arrivedAt });
  }

  // RELAY DATE LAW (owner): a fill dated before 2026-08-03 is TRANSPORTATION's history on the shared key and is never
  // stored under USMCA -- refused by name here (response + audit), never silently counted as "skipped".
  const { keep: rows, beforeFloor } = splitRelayRowsAtUsmcaFloor(allRows, storageCompanyId);
  await audit(storageCompanyId, "integrations.relay_fuel_webhook_received", "info", {
    operating_company_id: storageCompanyId,
    received_entity: company.code,
    received: allRows.length,
    refused_before_usmca_floor: beforeFloor,
  });
  if (rows.length === 0) {
    return reply.code(200).send({
      ok: true,
      status: "refused_before_usmca_floor",
      received: allRows.length,
      upserted: 0,
      refused_before_usmca_floor: beforeFloor,
      arrived_at: arrivedAt,
    });
  }

  const dates = rows
    .map((r) => String(r.created_at ?? r.createdAt ?? "").slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const today = arrivedAt.slice(0, 10);
  const stats = await withLuciaBypass((client) =>
    ingestForCompany(client, req, storageCompanyId, dates[0] ?? today, dates[dates.length - 1] ?? today, storageCode, {
      // ingestForCompany parses every row itself (parseRelayFuelTransactionRow): it skips a row with no id/timestamp
      // and REJECTS (named reason, audited, nothing stored) a row whose money field is not a dollar string.
      preloaded: rows as unknown as RelayFuelTransaction[],
      source: "webhook",
    })
  );
  // AFTER COMMIT — identical to the pull: TMS GL only behind its flags; the overage engine behind its flags.
  const pending: FuelTxnGlPostCandidate[] = stats.gl_post_candidates;
  await flushFuelGlPostsAfterCommit(pending, req.log);
  await flushFuelCardOverageAfterCommit(pending, req.log);

  return reply.code(200).send({
    ok: true,
    status: stats.rejected.length > 0 ? "ingested_with_rejected_rows" : "ingested",
    received: allRows.length,
    upserted: stats.upserted,
    skipped: stats.skipped,
    rejected: stats.rejected.length,
    rejected_rows: stats.rejected.slice(0, 50),
    refused_before_usmca_floor: beforeFloor,
    arrived_at: arrivedAt,
  });
}

export async function registerRelayFuelWebhookRoute(app: FastifyInstance) {
  await app.register(async (scoped) => {
    // The signature covers the exact bytes Relay sent, so the body is kept raw until it verifies.
    scoped.removeContentTypeParser("application/json");
    scoped.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    scoped.post(RELAY_WEBHOOK_PATH, { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, handleRelayWebhook);
  });
}

// RATECON-1 — rate-con extraction endpoint. POST an already-uploaded docs.files id; if the per-entity flag
// RATECON_EXTRACT_ENABLED is ON, read the PDF from R2, extract structured fields via the AI service, store the
// audit record, and return the extraction for the Book Load wizard to prefill (EDITABLE draft — never auto-books).
// Flag OFF → 409 policy error (no silent behavior). sha256 duplicate guard surfaces prior use (dispatcher decides).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as Sentry from "@sentry/node";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { getObjectBytes } from "../storage/r2-client.js";
import { extractRateConPdf, RateConTooLargeError } from "./ratecon-extract.service.js";
import {
  AnthropicNotConfiguredError,
  AnthropicRateLimitError,
  AnthropicTimeoutError,
} from "../ai/anthropic-messages.js";

export const RATECON_EXTRACT_FLAG_KEY = "RATECON_EXTRACT_ENABLED";

export type RateconErrorClassification = {
  status: number;
  body: Record<string, unknown>;
  /** Whether to capture this to Sentry (true for every 5xx — the silent-500 gap that hid the model outage). */
  capture: boolean;
  phase: string;
};

/** Pure error classifier for the extraction endpoint — unit-testable without Fastify. An upstream AI failure
 *  (bad response, timeout, rate limit, or an HTTP error incl. a retired-model 404) maps to 502 extraction_failed
 *  and is captured; it must never fall through to a silent 500. */
export function classifyRateconExtractError(err: unknown): RateconErrorClassification {
  if (err instanceof RateConTooLargeError) {
    return { status: 413, body: { error: "ratecon_too_large", reason: err.reason }, capture: false, phase: "too_large" };
  }
  const msg = String((err as Error)?.message ?? "");
  if (err instanceof AnthropicNotConfiguredError) {
    return { status: 503, body: { error: "ai_not_configured" }, capture: true, phase: "ai_not_configured" };
  }
  const isUpstreamAiFailure =
    msg.startsWith("ratecon_parse_error") ||
    msg.startsWith("anthropic_parse_error") ||
    msg.startsWith("anthropic_http_") ||
    err instanceof AnthropicTimeoutError ||
    err instanceof AnthropicRateLimitError;
  if (isUpstreamAiFailure) {
    return { status: 502, body: { error: "extraction_failed", detail: msg.slice(0, 120) }, capture: true, phase: "extraction_failed" };
  }
  if (msg === "ratecon_extraction_create_failed") {
    return { status: 503, body: { error: "extraction_persistence_failed" }, capture: true, phase: "persistence_failed" };
  }
  return { status: 500, body: { error: "internal_error" }, capture: true, phase: "internal_error" };
}

const extractBody = z.object({
  operating_company_id: z.string().uuid(),
  file_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerRateConExtractRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/dispatch/ratecon/extract",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const body = extractBody.safeParse(req.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
      const { operating_company_id: opco, file_id } = body.data;

      try {
        await assertCompanyMembership(user.uuid, opco);
      return await withCurrentUser(user.uuid, async (client) => {
          await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);

          // Kill-switch: OFF → 409, no Anthropic call, no behavior.
          const enabled = await isEnabled(client, RATECON_EXTRACT_FLAG_KEY, { operating_company_id: opco });
          if (!enabled) return reply.code(409).send({ error: "ratecon_extract_disabled" });

          // The uploaded rate con (RLS-scoped to opco).
          const fileRes = await client.query<{ r2_key: string; sha256_hash: string | null; mime_type: string; size_bytes: string }>(
            `SELECT r2_key, sha256_hash, mime_type, size_bytes::text
               FROM docs.files
              WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deleted_at IS NULL AND upload_completed_at IS NOT NULL`,
            [file_id, opco],
          );
          const file = fileRes.rows[0];
          if (!file) return reply.code(404).send({ error: "file_not_found" });

          // Duplicate guard: another completed file with the same sha256 already linked to a load.
          let duplicate_of: { file_id: string; load_id: string } | null = null;
          if (file.sha256_hash) {
            const dup = await client.query<{ file_id: string; load_id: string }>(
              `SELECT f.id::text AS file_id, fl.entity_id::text AS load_id
                 FROM docs.files f
                 JOIN docs.file_links fl ON fl.file_id = f.id AND fl.entity_type = 'load' AND fl.deleted_at IS NULL
                WHERE f.operating_company_id = $1::uuid AND f.sha256_hash = $2 AND f.id <> $3::uuid AND f.deleted_at IS NULL
                LIMIT 1`,
              [opco, file.sha256_hash, file_id],
            );
            if (dup.rows[0]) duplicate_of = dup.rows[0];
          }

          // Read bytes + extract (service enforces 10MB/15pg caps + injection-safe prompt + cents validation).
          const bytes = await getObjectBytes(file.r2_key);
          const result = await extractRateConPdf(bytes);

          // Audit record — exactly what the AI read, keyed to the file.
          const rec = await client.query<{ id: string }>(
            `INSERT INTO dispatch.ratecon_extractions
               (operating_company_id, file_id, model_id, status, page_count, byte_size, extracted_total_cents,
                total_matches_components, raw_extraction, created_by_user_id)
             VALUES ($1::uuid,$2::uuid,$3,'extracted',$4,$5,$6,$7,$8::jsonb,$9::uuid) RETURNING id`,
            [opco, file_id, result.model_id, result.page_count, result.byte_size,
             result.extraction.rate.total_cents, result.total_matches_components,
             JSON.stringify(result.extraction), user.uuid],
          );
          const extractionId = rec.rows[0]?.id;
          if (!extractionId) throw new Error("ratecon_extraction_create_failed");

          return reply.send({
            extraction_id: extractionId,
            extraction: result.extraction,
            total_matches_components: result.total_matches_components,
            page_count: result.page_count,
            duplicate_of,
          });
        });
      } catch (err) {
        const c = classifyRateconExtractError(err);
        if (c.status >= 500) req.log?.error({ err }, `ratecon extract failed (${c.phase})`);
        // Capture every 5xx to Sentry — the silent-500 gap is what hid the retired-model outage for 24h.
        if (c.capture) Sentry.captureException(err, { tags: { subsystem: "ratecon-extract", phase: c.phase } });
        return reply.code(c.status).send(c.body);
      }
    },
  );
}

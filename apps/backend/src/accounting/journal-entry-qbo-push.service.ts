import { pool, withLuciaBypass } from "../auth/db.js";
import { qboApiBase } from "../integrations/qbo/qbo-client.js";
import { getValidAccessToken } from "../integrations/qbo/qbo-oauth.service.js";
import { loadJournalEntryForSync, mapJournalEntryToQboPayload } from "../integrations/qbo/journal-entry-qbo-mapping.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { evaluateJeQboPushGate, JE_QBO_PUSH_FLAG, QBO_PUSH_REFUSED_IMPORT_SOURCE } from "./qbo-je-push-gate.js";

// IMPORT-P0 — JE→QBO push kill-switch (immediate best-effort path). QBO is the system of record through
// 12/31/2025; the TMS must not write journal entries into QuickBooks unless the owner enables it per
// entity. The push decision is made by the SHARED gate (qbo-je-push-gate.ts), which is ALSO consulted by
// the queue-drain path (sync-outbound-accounting.ts) so both live paths enforce the same two layers:
// (1) default-OFF per-entity flag, (2) structural refusal of any non-'tms' (QBO-origin) source that can
// never be flipped away. LAYER 3 (masterdata echo guard) lives in the accounts pusher (proven by test).
// Re-exported for the proof harness + callers.
export { JE_QBO_PUSH_FLAG, QBO_PUSH_REFUSED_IMPORT_SOURCE } from "./qbo-je-push-gate.js";
const P0_SYSTEM_ACTOR = "00000000-0000-4000-8000-000000000001";

function preview(text: string) {
  return text
    .replace(/"access_token"\s*:\s*"[^"]*"/g, '"access_token":"[REDACTED]"')
    .replace(/"refresh_token"\s*:\s*"[^"]*"/g, '"refresh_token":"[REDACTED]"')
    .slice(0, 500);
}

async function persistJournalFailureAlert(operatingCompanyId: string, journalEntryId: string, error: unknown) {
  const message = String((error as Error)?.message ?? "journal_entry_qbo_push_failed");
  const status = Number((error as { status?: number }).status ?? 0);
  const bodyPreview = String((error as { bodyPreview?: string }).bodyPreview ?? "");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const existsRes = await client.query(`SELECT to_regclass('qbo.sync_alerts') IS NOT NULL AS ok`);
    if (existsRes.rows[0]?.ok) {
      await client.query(
        `
          INSERT INTO qbo.sync_alerts (
            operating_company_id,
            entity_type,
            entity_id,
            operation,
            error_code,
            error_message,
            error_payload,
            retry_count,
            max_retries,
            next_retry_at,
            severity,
            replay_hint
          )
          VALUES ($1,$2,$3::uuid,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)
        `,
        [
          operatingCompanyId,
          "journal_entry",
          journalEntryId,
          "create",
          status ? `http_${status}` : null,
          message,
          JSON.stringify({ body_preview: bodyPreview, replay_kind: "qbo_journal_entry" }),
          0,
          3,
          new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          "error",
          "qbo_journal_entry",
        ]
      );
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    client.release();
  }
}

/** LAYER 2 — persist a NON-replayable sync alert for a refused import/QBO-origin JE (replay_hint NULL).
 *  Distinct from persistJournalFailureAlert (which is replayable): an imported entry must never be
 *  replayed into QuickBooks, ever. */
async function persistImportRefusalAlert(operatingCompanyId: string, journalEntryId: string, sourceSystem: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const existsRes = await client.query(`SELECT to_regclass('qbo.sync_alerts') IS NOT NULL AS ok`);
    if (existsRes.rows[0]?.ok) {
      await client.query(
        `
          INSERT INTO qbo.sync_alerts (
            operating_company_id, entity_type, entity_id, operation,
            error_code, error_message, error_payload,
            retry_count, max_retries, next_retry_at, severity, replay_hint
          )
          VALUES ($1,$2,$3::uuid,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)
        `,
        [
          operatingCompanyId,
          "journal_entry",
          journalEntryId,
          "push_refused",
          QBO_PUSH_REFUSED_IMPORT_SOURCE,
          `refused JE→QBO push: source_system='${sourceSystem}' is QBO-origin and must never round-trip`,
          JSON.stringify({ source_system: sourceSystem, never_replayable: true }),
          0,
          0,
          null, // no retry — permanent refusal
          "error",
          null, // replay_hint NULL → never replayable
        ]
      );
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    client.release();
  }
}

/** LAYER 1 — one audit breadcrumb whenever the push is skipped because QBO_JE_PUSH_ENABLED is OFF. */
async function writePushSkippedBreadcrumb(operatingCompanyId: string, journalEntryId: string) {
  try {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      await appendCrudAudit(
        client,
        P0_SYSTEM_ACTOR,
        "accounting.journal_entry_push_skipped_flag_off",
        {
          resource_type: "accounting.journal_entries",
          resource_id: journalEntryId,
          operating_company_id: operatingCompanyId,
          flag_key: JE_QBO_PUSH_FLAG,
        },
        "warning",
        "IMPORT-P0"
      );
    });
  } catch {
    // A breadcrumb failure must never turn a safe skip into a push — swallow.
  }
}

async function emitJournalOutbox(operatingCompanyId: string, journalEntryId: string, qboJournalEntryId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
      "accounting.journal_entry_pushed_to_qbo",
      JSON.stringify({
        operating_company_id: operatingCompanyId,
        journal_entry_id: journalEntryId,
        qbo_journal_entry_id: qboJournalEntryId,
      }),
    ]);
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    client.release();
  }
}

export async function pushJournalEntryToQuickBooksFromQueue(job: { operating_company_id: string; entity_id: string }) {
  const oc = job.operating_company_id;
  const headerProbe = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
    return client.query<{
      qbo_journal_entry_id: string | null;
      qbo_sync_pending: boolean;
      status: string;
      source_system: string | null;
    }>(
      `
        SELECT qbo_journal_entry_id, qbo_sync_pending, status, source_system
        FROM accounting.journal_entries
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [job.entity_id, oc]
    );
  });
  const probe = headerProbe.rows[0];

  // ── LAYER 1 + LAYER 2 via the SHARED gate — evaluated BEFORE getValidAccessToken so a disabled/refused
  // entity fetches no token and makes ZERO HTTP. source_system comes from the probe (no extra query). ────
  const gate = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
    return evaluateJeQboPushGate(client, oc, job.entity_id, { sourceSystem: probe?.source_system ?? "tms" });
  });
  // LAYER 2 — structural refusal (independent of the flag): a QBO-origin / imported JE must NEVER
  // round-trip. Record a NON-replayable alert and throw.
  if (gate.decision === "import_source") {
    await persistImportRefusalAlert(oc, job.entity_id, gate.sourceSystem);
    const err = new Error(QBO_PUSH_REFUSED_IMPORT_SOURCE);
    (err as { code?: string }).code = QBO_PUSH_REFUSED_IMPORT_SOURCE;
    throw err;
  }
  // LAYER 1 — flag OFF for this entity: skip with one audit breadcrumb, zero HTTP.
  if (gate.decision === "flag_off") {
    await writePushSkippedBreadcrumb(oc, job.entity_id);
    return { qboId: null as string | null, skipped: "qbo_je_push_disabled" as const };
  }

  if (probe?.qbo_journal_entry_id && probe.qbo_sync_pending === false) {
    return { qboId: probe.qbo_journal_entry_id };
  }

  const ctx = await loadJournalEntryForSync(oc, job.entity_id);
  if (!ctx) throw new Error("journal_entry_not_found_for_sync");

  if (ctx.header.status === "voided") {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
      await client.query(
        `
          UPDATE accounting.journal_entries
          SET qbo_journal_entry_id = NULL,
              qbo_sync_pending = false,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
        `,
        [job.entity_id, oc]
      );
    });
    return { qboId: null as string | null };
  }

  const token = await getValidAccessToken(oc);
  const payload = {
    ...mapJournalEntryToQboPayload(ctx),
    DocNumber: ctx.header.id.replace(/-/g, "").slice(0, 21),
  };

  const url = `${qboApiBase()}/${token.realm_id}/journalentry?minorversion=75`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    const err = new Error(`qbo_journal_entry_failed_status_${response.status}`);
    (err as { status?: number }).status = response.status;
    (err as { bodyPreview?: string }).bodyPreview = preview(responseText);
    throw err;
  }

  const parsed = JSON.parse(responseText) as { JournalEntry?: { Id?: string } };
  const qboId = parsed.JournalEntry?.Id ?? null;
  if (!qboId) throw new Error("qbo_journal_entry_missing_id");

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
    await client.query(
      `
        UPDATE accounting.journal_entries
        SET qbo_journal_entry_id = $3,
            qbo_sync_pending = false,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
      `,
      [job.entity_id, oc, qboId]
    );
  });

  return { qboId };
}

export async function pushJournalEntryToQuickBooksImmediateBestEffort(params: { operatingCompanyId: string; journalEntryId: string }) {
  try {
    const result = await pushJournalEntryToQuickBooksFromQueue({
      operating_company_id: params.operatingCompanyId,
      entity_id: params.journalEntryId,
    });
    // Flag-off skip and structural refusal both return / throw before any HTTP; only a real push yields a
    // qboId to mirror into the outbox.
    if (result.qboId) {
      await emitJournalOutbox(params.operatingCompanyId, params.journalEntryId, result.qboId);
    }
  } catch (error) {
    // A structural import-source refusal already persisted its own NON-replayable alert — do not also
    // write a replayable failure alert (that would offer to replay an entry that must never round-trip).
    if ((error as { code?: string })?.code === QBO_PUSH_REFUSED_IMPORT_SOURCE) return;
    await persistJournalFailureAlert(params.operatingCompanyId, params.journalEntryId, error);
  }
}

import { getValidAccessToken } from "./qbo-oauth.service.js";
import { qboApiBase } from "./qbo-client.js";
import { withLuciaBypass } from "../../auth/db.js";
import { markRealmCdcPolled } from "./qbo-cdc-poll-state.js";

const CDC_ENTITIES =
  "Invoice,Bill,Payment,BillPayment,JournalEntry,CreditMemo,Customer,Vendor,Item,Account";

export type CdcTriggeredBy = "cdc_poll" | "manual_replay";

type FlattenedCdcRow = { entityType: string; entity: Record<string, unknown> };

function flattenCdcResponse(json: unknown): FlattenedCdcRow[] {
  const out: FlattenedCdcRow[] = [];
  const root = json as Record<string, unknown>;
  const cdcResponse = root.CDCResponse;
  const blocks = Array.isArray(cdcResponse) ? cdcResponse : cdcResponse ? [cdcResponse] : [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const qr = (block as Record<string, unknown>).QueryResponse;
    if (!qr || typeof qr !== "object") continue;
    for (const [entityType, val] of Object.entries(qr as Record<string, unknown>)) {
      if (entityType === "maxResults" || entityType === "startPosition") continue;
      const rows = Array.isArray(val) ? val : val != null && typeof val === "object" ? [val] : [];
      for (const row of rows) {
        if (row && typeof row === "object") out.push({ entityType, entity: row as Record<string, unknown> });
      }
    }
  }
  return out;
}

function metaLastUpdated(entity: Record<string, unknown>): string | null {
  const meta = entity.MetaData as Record<string, unknown> | undefined;
  const raw = meta?.LastUpdatedTime;
  return typeof raw === "string" ? raw : null;
}

function entityNumericId(entity: Record<string, unknown>): string | null {
  const id = entity.Id;
  return id != null ? String(id) : null;
}

async function fetchCdcRaw(
  operatingCompanyId: string,
  realmId: string,
  changedSinceIso: string,
  on410FullPull: () => void
): Promise<{ ok: boolean; status: number; json: unknown | null; text: string }> {
  const attempt = async (sinceIso: string) => {
    const token = await getValidAccessToken(operatingCompanyId);
    const url = `${qboApiBase()}/${encodeURIComponent(realmId)}/cdc?entities=${encodeURIComponent(CDC_ENTITIES)}&changedSince=${encodeURIComponent(
      sinceIso
    )}&minorversion=75`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token.access_token}`,
    };
    const res = await fetch(url, { method: "GET", headers });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text };
  };

  let first = await attempt(changedSinceIso);
  if (first.status === 401) {
    await getValidAccessToken(operatingCompanyId);
    first = await attempt(changedSinceIso);
  }
  if (first.status === 410) {
    on410FullPull();
    const epoch = "1970-01-01T00:00:00Z";
    first = await attempt(epoch);
    if (first.status === 401) {
      await getValidAccessToken(operatingCompanyId);
      first = await attempt(epoch);
    }
  }
  return first;
}

async function resolveChangedSinceIso(client: { query: (sql: string, vals?: unknown[]) => Promise<{ rows: unknown[] }> }, realmId: string): Promise<string> {
  const res = await client.query(
    `
      SELECT MAX(qbo_last_updated_at)::text AS max_iso
      FROM integrations.qbo_inbound_events
      WHERE qbo_realm_id = $1
        AND payload_raw->>'triggered_by' IN ('cdc_poll', 'manual_replay')
        AND status IN ('received', 'fetched', 'applied')
    `,
    [realmId]
  );
  const maxIso = (res.rows[0] as { max_iso?: string | null } | undefined)?.max_iso;
  if (maxIso) return new Date(maxIso).toISOString();
  return new Date(0).toISOString();
}

async function alreadyArchivedSameMeta(
  client: { query: (sql: string, vals?: unknown[]) => Promise<{ rows: { ok?: boolean }[] }> },
  operatingCompanyId: string,
  realmId: string,
  entityType: string,
  entityId: string,
  metaIso: string | null
): Promise<boolean> {
  if (!metaIso) return false;
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM qbo_archive.entities_snapshot s
        WHERE s.operating_company_id = $1::uuid
          AND s.qbo_realm_id = $2
          AND s.qbo_entity_type = $3
          AND s.qbo_entity_id = $4
          AND COALESCE(s.raw_snapshot->'MetaData'->>'LastUpdatedTime','') = $5
      ) AS ok
    `,
    [operatingCompanyId, realmId, entityType, entityId, metaIso]
  );
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

async function duplicateInboundLedger(
  client: { query: (sql: string, vals?: unknown[]) => Promise<{ rows: { ok?: boolean }[] }> },
  realmId: string,
  entityType: string,
  entityId: string,
  metaIso: string | null
): Promise<boolean> {
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1 FROM integrations.qbo_inbound_events e
        WHERE e.qbo_realm_id = $1
          AND e.qbo_entity_type = $2
          AND e.qbo_entity_id = $3
          AND (
            $4::timestamptz IS NULL
            OR e.qbo_last_updated_at IS NOT DISTINCT FROM $4::timestamptz
          )
          AND e.payload_raw->>'triggered_by' IN ('cdc_poll', 'manual_replay')
      ) AS ok
    `,
    [realmId, entityType, entityId, metaIso]
  );
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

/**
 * Runs QBO CDC for one realm, inserts inbound ledger rows for unseen entities (archive dedupe via snapshot MetaData).
 */
export async function runQboCdcIngest(params: {
  operating_company_id: string;
  qbo_realm_id: string;
  changed_since_override_iso?: string | null;
  triggered_by: CdcTriggeredBy;
  logWarning?: (msg: string, meta?: Record<string, unknown>) => void;
}): Promise<{ inserted: number; skipped_duplicates: number; http_status: number }> {
  let inserted = 0;
  let skippedDuplicates = 0;
  let httpStatus = 200;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [params.operating_company_id]);

    const changedSince =
      params.changed_since_override_iso?.trim() ||
      (await resolveChangedSinceIso(client, params.qbo_realm_id));

    let saw410 = false;
    const fetchResult = await fetchCdcRaw(params.operating_company_id, params.qbo_realm_id, changedSince, () => {
      saw410 = true;
    });

    httpStatus = fetchResult.status;
    if (saw410) params.logWarning?.("qbo_cdc_cursor_expired_full_pull", { realm: params.qbo_realm_id });

    if (!fetchResult.ok) {
      params.logWarning?.("qbo_cdc_fetch_failed", {
        realm: params.qbo_realm_id,
        status: fetchResult.status,
        preview: String(fetchResult.text ?? "").slice(0, 400),
      });
      markRealmCdcPolled(params.qbo_realm_id);
      return;
    }

    const rows = flattenCdcResponse(fetchResult.json);
    for (const { entityType, entity } of rows) {
      const entityId = entityNumericId(entity);
      if (!entityId) continue;
      const metaIso = metaLastUpdated(entity);
      const dupInbound = await duplicateInboundLedger(client, params.qbo_realm_id, entityType, entityId, metaIso);
      if (dupInbound) {
        skippedDuplicates += 1;
        continue;
      }
      const archived = await alreadyArchivedSameMeta(
        client,
        params.operating_company_id,
        params.qbo_realm_id,
        entityType,
        entityId,
        metaIso
      );
      if (archived) {
        skippedDuplicates += 1;
        continue;
      }

      const payloadRaw = {
        triggered_by: params.triggered_by,
        cdc_entity_stub: entity,
      };

      await client.query(
        `
          INSERT INTO integrations.qbo_inbound_events (
            operating_company_id,
            qbo_realm_id,
            webhook_signature_valid,
            qbo_event_type,
            qbo_entity_type,
            qbo_entity_id,
            qbo_last_updated_at,
            status,
            payload_raw
          )
          VALUES ($1,$2,false,$3,$4,$5,$6::timestamptz,'received',$7::jsonb)
        `,
        [
          params.operating_company_id,
          params.qbo_realm_id,
          params.triggered_by,
          entityType,
          entityId,
          metaIso,
          JSON.stringify(payloadRaw),
        ]
      );
      inserted += 1;
    }

    markRealmCdcPolled(params.qbo_realm_id);
  });

  return { inserted, skipped_duplicates: skippedDuplicates, http_status: httpStatus };
}

export async function listConfiguredWave2Realms(): Promise<Array<{ realm_id: string; operating_company_id: string }>> {
  const envRealms = [process.env.QBO_REALM_ID_TRK, process.env.QBO_REALM_ID_TRANSP].map((r) => (r ?? "").trim()).filter(Boolean);
  if (!envRealms.length) return [];

  return withLuciaBypass(async (client) => {
    const res = await client.query<{ realm_id: string; operating_company_id: string }>(
      `
        SELECT DISTINCT realm_id::text AS realm_id, operating_company_id::text AS operating_company_id
        FROM integrations.qbo_connections
        WHERE revoked_at IS NULL
          AND realm_id::text = ANY ($1::text[])
      `,
      [envRealms]
    );
    return res.rows;
  });
}

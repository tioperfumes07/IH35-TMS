/**
 * PERFUME-LEAD-EVENTS — who / when for every change in the Lead lane (fully-wired checklist item g, owner 2026-11-26 18:13 CT).
 * perfume.lead_events is append-only (SELECT, INSERT). Each writer in contacts / catalogs / Excel update / campaigns / traders
 * records one row in the same transaction as its change, so the history can never disagree with the data.
 */
import type pg from "pg";

export type LeadEntity = "company" | "person" | "catalog_value" | "campaign" | "segment" | "trade" | "trade_buyer" | "contact_upload";
export type LeadEvent = { entity: LeadEntity; entity_id: string; company_id?: string | null; action: string; detail?: Record<string, unknown>; upload_id?: string | null };

export async function logEvent(c: pg.PoolClient, uid: string | null, e: LeadEvent) {
  await c.query(
    `INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, upload_id, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
    [e.entity, e.entity_id, e.company_id ?? null, e.action, JSON.stringify(e.detail ?? {}), e.upload_id ?? null, uid]);
}

/** Many rows in one statement (an Excel Apply can touch thousands of contacts). */
export async function logEvents(c: pg.PoolClient, uid: string | null, es: LeadEvent[]) {
  for (let i = 0; i < es.length; i += 1000) {
    const part = es.slice(i, i + 1000);
    await c.query(
      `INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, upload_id, created_by, created_at)
       SELECT x.entity, x.entity_id::uuid, x.company_id::uuid, x.action, x.detail, x.upload_id::uuid, $2, clock_timestamp()
         FROM jsonb_to_recordset($1::jsonb) AS x(entity text, entity_id text, company_id text, action text, detail jsonb, upload_id text)`,
      [JSON.stringify(part.map((e) => ({ ...e, company_id: e.company_id ?? null, detail: e.detail ?? {}, upload_id: e.upload_id ?? null }))), uid]);
  }
}

const HISTORY_COLS = `e.id, e.entity, e.entity_id, e.action, e.detail, e.upload_id, e.created_at,
  coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) AS by_name`;

/** One record's history, newest first. */
export async function historyOf(c: pg.PoolClient, entity: LeadEntity, id: string) {
  return (await c.query(
    `SELECT ${HISTORY_COLS} FROM perfume.lead_events e LEFT JOIN identity.users u ON u.id = e.created_by
      WHERE (e.entity = $1 AND e.entity_id = $2)
         OR ($1 = 'trade' AND e.entity = 'trade_buyer' AND e.detail->>'trade_id' = $2::text)
      ORDER BY e.created_at DESC, e.id LIMIT 500`, [entity, id])).rows;
}

/** A company's history: the company, its people, and the trades / buyers that name it, newest first. */
export async function companyHistory(c: pg.PoolClient, companyId: string) {
  return (await c.query(
    `SELECT ${HISTORY_COLS} FROM perfume.lead_events e LEFT JOIN identity.users u ON u.id = e.created_by
      WHERE (e.entity = 'company' AND e.entity_id = $1) OR e.company_id = $1
         OR e.company_id IN (SELECT m.id FROM perfume.contact_companies m WHERE m.merged_into_id = $1)
      ORDER BY e.created_at DESC, e.id LIMIT 500`, [companyId])).rows;
}

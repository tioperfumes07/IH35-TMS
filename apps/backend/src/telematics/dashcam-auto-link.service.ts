import { fetchSamsaraClipUrlForCompany, insertDashcamClip } from "./dashcam.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type AutoLinkInput = {
  operating_company_id: string;
  unit_id: string;
  occurred_at: string;
  payload: Record<string, unknown>;
};

function parseHarshClipCandidates(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? (payload.data as Record<string, unknown>) : payload;
  const buckets = [data.harsh_events, data.events, payload.events, payload.harsh_events];
  const out: Array<{ harshRawId: string; clipId: string }> = [];
  for (const raw of buckets) {
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const harshId = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "";
      const clipRaw = obj.clip_id ?? obj.clipId ?? obj.video_clip_id ?? obj.videoClipId;
      const clipId = typeof clipRaw === "string" && clipRaw.trim() ? clipRaw.trim() : "";
      if (!harshId || !clipId) continue;
      out.push({ harshRawId: harshId, clipId });
    }
  }
  const deduped: Array<{ harshRawId: string; clipId: string }> = [];
  const seen = new Set<string>();
  for (const row of out) {
    const key = `${row.harshRawId}::${row.clipId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

async function relationExists(client: DbClient, relation: string) {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

export async function processDashcamAutoLinkFromWebhook(client: DbClient, input: AutoLinkInput) {
  const candidates = parseHarshClipCandidates(input.payload);
  if (candidates.length === 0) return 0;
  if (!(await relationExists(client, "telematics.dashcam_clips"))) return 0;
  if (!(await relationExists(client, "safety.harsh_events"))) return 0;

  let inserted = 0;
  for (const item of candidates) {
    const harsh = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM safety.harsh_events
        WHERE operating_company_id = $1::uuid
          AND raw_samsara_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [input.operating_company_id, item.harshRawId]
    );
    const harshEventId = harsh.rows[0]?.id;
    if (!harshEventId) continue;
    const clipUrl = await fetchSamsaraClipUrlForCompany(client, input.operating_company_id, item.clipId);
    if (!clipUrl) continue;
    await insertDashcamClip(client, {
      operating_company_id: input.operating_company_id,
      unit_id: input.unit_id,
      triggered_at: input.occurred_at,
      duration_sec: 30,
      camera_facing: "both",
      samsara_clip_url: clipUrl,
      samsara_clip_id: item.clipId,
      trigger_kind: "harsh_event",
      linked_harsh_event_id: harshEventId,
    });
    inserted += 1;
  }
  return inserted;
}

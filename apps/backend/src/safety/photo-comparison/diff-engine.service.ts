import type { AnthropicCompareClient } from "./anthropic-client.js";
import { createAnthropicClient } from "./anthropic-client.js";
import { startChain } from "../damage-continuity/continuity.service.js";
import {
  getSession,
  type PhotoEvidenceDetail,
  updateSessionDiffResult,
  type DiffStatus,
} from "./session.service.js";

export const HIGH_CONFIDENCE_THRESHOLD = 0.8;

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type AnglePairFinding = {
  angle_label: string;
  pre_evidence_uuid: string;
  post_evidence_uuid: string;
  has_new_damage: boolean;
  findings: Array<{
    location: string;
    severity: string;
    description: string;
    confidence: number;
  }>;
};

export type AggregatedDiffResult = {
  diff_status: DiffStatus;
  diff_findings: AnglePairFinding[];
  diff_summary: string;
  auto_damage_report_uuid: string | null;
};

function pairByAngle(
  prePhotos: PhotoEvidenceDetail[],
  postPhotos: PhotoEvidenceDetail[]
): Array<{ angle: string; pre: PhotoEvidenceDetail; post: PhotoEvidenceDetail }> {
  const preByAngle = new Map<string, PhotoEvidenceDetail>();
  for (const photo of prePhotos) {
    if (photo.angle_label) preByAngle.set(photo.angle_label, photo);
  }
  const pairs: Array<{ angle: string; pre: PhotoEvidenceDetail; post: PhotoEvidenceDetail }> = [];
  for (const post of postPhotos) {
    if (!post.angle_label) continue;
    const pre = preByAngle.get(post.angle_label);
    if (pre) pairs.push({ angle: post.angle_label, pre, post });
  }
  return pairs;
}

function aggregateStatus(allFindings: AnglePairFinding[]): DiffStatus {
  const damageFindings = allFindings.flatMap((p) =>
    p.findings.map((f) => ({ ...f, angle: p.angle_label }))
  );
  if (damageFindings.length === 0) return "clean";
  const hasHigh = damageFindings.some((f) => f.confidence >= HIGH_CONFIDENCE_THRESHOLD);
  return hasHigh ? "damage_detected" : "review_required";
}

async function createAutoDamageReport(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    sessionUuid: string;
    loadUuid: string | null;
    driverUuid: string;
    unitUuid: string;
    summary: string;
    findings: AnglePairFinding[];
  }
): Promise<string> {
  const description = `AI-detected in-transit damage (GAP-50 session ${input.sessionUuid}). ${input.summary}`;
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO safety.incidents (
        operating_company_id,
        incident_type,
        incident_at,
        location,
        description,
        driver_id,
        unit_id,
        load_id,
        status,
        damage_amount_cents
      )
      VALUES ($1::uuid, 'damage_report', now(), 'in_transit', $2, $3::uuid, $4::uuid, $5::uuid, 'open', 0)
      RETURNING id::text
    `,
    [input.operatingCompanyId, description, input.driverUuid, input.unitUuid, input.loadUuid]
  );
  const damageId = inserted.rows[0]?.id;
  if (!damageId) throw new Error("auto_damage_report_failed");

  await startChain(client, {
    operatingCompanyId: input.operatingCompanyId,
    initialDamageId: damageId,
  });

  return damageId;
}

export async function runDiff(
  client: DbClient,
  operatingCompanyId: string,
  sessionUuid: string,
  anthropicClient: AnthropicCompareClient = createAnthropicClient()
): Promise<AggregatedDiffResult> {
  const session = await getSession(client, operatingCompanyId, sessionUuid);
  if (!session) throw new Error("session_not_found");
  if (!session.post_trip_evidence_uuids?.length) {
    throw new Error("post_trip_photos_missing");
  }

  const prePhotos = session.pre_trip_photos ?? [];
  const postPhotos = session.post_trip_photos ?? [];
  const pairs = pairByAngle(prePhotos, postPhotos);

  const angleFindings: AnglePairFinding[] = [];
  for (const pair of pairs) {
    const preUrl = pair.pre.download_url;
    const postUrl = pair.post.download_url;
    if (!preUrl || !postUrl) {
      angleFindings.push({
        angle_label: pair.angle,
        pre_evidence_uuid: pair.pre.id,
        post_evidence_uuid: pair.post.id,
        has_new_damage: false,
        findings: [],
      });
      continue;
    }

    const result = await anthropicClient.compareImages(preUrl, postUrl, pair.angle);
    angleFindings.push({
      angle_label: pair.angle,
      pre_evidence_uuid: pair.pre.id,
      post_evidence_uuid: pair.post.id,
      has_new_damage: result.has_new_damage,
      findings: result.has_new_damage ? result.findings : [],
    });
  }

  const flatDamage = angleFindings.filter((a) => a.has_new_damage && a.findings.length > 0);
  const diffStatus = flatDamage.length === 0 ? "clean" : aggregateStatus(flatDamage);
  const diffSummary =
    diffStatus === "clean"
      ? "No new damage detected across paired angles."
      : `${flatDamage.length} angle(s) with new damage findings.`;

  let autoDamageReportUuid: string | null = null;
  if (diffStatus === "damage_detected") {
    autoDamageReportUuid = await createAutoDamageReport(client, {
      operatingCompanyId,
      sessionUuid,
      loadUuid: session.load_uuid,
      driverUuid: session.driver_uuid,
      unitUuid: session.unit_uuid,
      summary: diffSummary,
      findings: flatDamage,
    });
  }

  await updateSessionDiffResult(client, {
    sessionUuid,
    diffStatus,
    diffFindings: angleFindings,
    diffSummary,
    autoDamageReportUuid,
  });

  return {
    diff_status: diffStatus,
    diff_findings: angleFindings,
    diff_summary: diffSummary,
    auto_damage_report_uuid: autoDamageReportUuid,
  };
}

export { pairByAngle, aggregateStatus };

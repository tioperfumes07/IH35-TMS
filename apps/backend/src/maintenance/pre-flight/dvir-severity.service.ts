import { appendCrudAudit } from "../../audit/crud-audit.js";
import {
  classifyMajorDefect,
  isMajorDefectCode,
  type DvirSeverity,
} from "./major-defect-catalog.js";

export type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type TagSource = "classifier" | "driver" | "override";

export type ClassifyResult = {
  severity: DvirSeverity;
  major_defect_code: string | null;
  cfr: string | null;
};

/**
 * Pure heuristic + catalog classification.  A catalog match → "major" with the
 * matched CFR code; otherwise the defect defaults to "minor" (safer than
 * "observation" so WF-050 still surfaces it for review).
 */
export function classifyDefect(
  description: string | null | undefined,
  category?: string | null
): ClassifyResult {
  const match = classifyMajorDefect(description, category);
  if (match) {
    return { severity: "major", major_defect_code: match.code, cfr: match.cfr };
  }
  return { severity: "minor", major_defect_code: null, cfr: null };
}

const ALLOWED_SEVERITIES: DvirSeverity[] = ["major", "minor", "observation"];

export function isValidSeverity(value: string): value is DvirSeverity {
  return (ALLOWED_SEVERITIES as string[]).includes(value);
}

/** Roles permitted to flip a defect into or out of "major". */
const MANAGER_ROLES = new Set(["owner", "admin", "manager", "safety", "maintenance_manager", "fleet_manager"]);

export function canOverrideMajor(role: string | null | undefined): boolean {
  return MANAGER_ROLES.has(String(role ?? "").trim().toLowerCase());
}

export type EffectiveSeverity = {
  dvir_defect_id: string;
  severity: DvirSeverity;
  major_defect_code: string | null;
  source: TagSource;
  routed: boolean;
  auto_wo_id: string | null;
  created_at: string;
} | null;

/** Latest severity tag for a defect, or null if it has never been tagged. */
export async function getEffectiveSeverity(
  client: DbClient,
  operatingCompanyId: string,
  defectId: string
): Promise<EffectiveSeverity> {
  const res = await client.query<NonNullable<EffectiveSeverity>>(
    `
      SELECT dvir_defect_id, severity, major_defect_code, source, routed, auto_wo_id, created_at::text AS created_at
      FROM safety.dvir_defect_severity_tags
      WHERE operating_company_id = $1
        AND dvir_defect_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, defectId]
  );
  return res.rows[0] ?? null;
}

export type InsertSeverityTagInput = {
  operatingCompanyId: string;
  defectId: string;
  severity: DvirSeverity;
  majorDefectCode?: string | null;
  source: TagSource;
  setByUserId?: string | null;
  reason?: string | null;
  routed?: boolean;
  autoWoId?: string | null;
};

export async function insertSeverityTag(
  client: DbClient,
  input: InsertSeverityTagInput
): Promise<{ id: string }> {
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO safety.dvir_defect_severity_tags (
        operating_company_id,
        dvir_defect_id,
        severity,
        major_defect_code,
        source,
        routed,
        auto_wo_id,
        set_by_user_id,
        reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `,
    [
      input.operatingCompanyId,
      input.defectId,
      input.severity,
      input.majorDefectCode ?? null,
      input.source,
      input.routed ?? false,
      input.autoWoId ?? null,
      input.setByUserId ?? null,
      input.reason ?? null,
    ]
  );
  return { id: res.rows[0]?.id ?? "" };
}

export type SetSeverityResult =
  | { ok: true; tag_id: string; severity: DvirSeverity; major_defect_code: string | null }
  | { error: "defect_not_found" | "invalid_severity" | "forbidden_major_override" | "major_code_required" };

/**
 * Audit-tracked severity override.  Manager+ role is required whenever the change
 * crosses the major boundary (current→major or major→non-major).  Always recorded
 * as a new append-only tag row so the full override history is preserved.
 */
export async function setSeverity(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    defectId: string;
    severity: string;
    majorDefectCode?: string | null;
    userId: string;
    role: string | null;
    reason?: string | null;
  }
): Promise<SetSeverityResult> {
  if (!isValidSeverity(args.severity)) {
    return { error: "invalid_severity" };
  }

  const defectRes = await client.query<{ id: string }>(
    `
      SELECT id
      FROM safety.dvir_defects
      WHERE id = $1
        AND operating_company_id = $2
      LIMIT 1
    `,
    [args.defectId, args.operatingCompanyId]
  );
  if (!defectRes.rows[0]) {
    return { error: "defect_not_found" };
  }

  const current = await getEffectiveSeverity(client, args.operatingCompanyId, args.defectId);
  const crossesMajorBoundary = args.severity === "major" || current?.severity === "major";
  if (crossesMajorBoundary && !canOverrideMajor(args.role)) {
    return { error: "forbidden_major_override" };
  }

  let majorCode = args.majorDefectCode ?? null;
  if (args.severity === "major") {
    if (majorCode && !isMajorDefectCode(majorCode)) {
      majorCode = null;
    }
    if (!majorCode) {
      return { error: "major_code_required" };
    }
  } else {
    majorCode = null;
  }

  const tag = await insertSeverityTag(client, {
    operatingCompanyId: args.operatingCompanyId,
    defectId: args.defectId,
    severity: args.severity,
    majorDefectCode: majorCode,
    source: "override",
    setByUserId: args.userId,
    reason: args.reason ?? null,
  });

  await appendCrudAudit(
    client,
    args.userId,
    "safety.dvir.severity_override",
    {
      resource_type: "safety.dvir_defect_severity_tags",
      resource_id: tag.id,
      dvir_defect_id: args.defectId,
      from_severity: current?.severity ?? null,
      to_severity: args.severity,
      major_defect_code: majorCode,
    },
    args.severity === "major" ? "warning" : "info",
    "WF-050"
  );

  return { ok: true, tag_id: tag.id, severity: args.severity, major_defect_code: majorCode };
}

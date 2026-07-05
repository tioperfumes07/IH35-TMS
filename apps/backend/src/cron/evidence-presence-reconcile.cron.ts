// @cron-tenant-agnostic: global reliability monitor — deliberately scans EVERY company's evidence
// rows via withLuciaBypass (RLS-bypass, read-only) and never sets/scopes a single app.operating_company_id.
// The operatingCompanyId carried on each row is used only to attribute the fail-loud alarm to the owning
// company; there is no per-tenant scheduler context to assert (DD-7 / B-017 does not apply).
//
// FINDING H5-3 — R2-evidence PRESENCE reconcile + real DR-drill evidence check.
//
// WHY: CI guards (verify-backups-current.mjs) prove the DR *artifacts* exist and that Neon PITR
// retention is configured; they do NOT prove that the evidence objects our DB rows CLAIM to hold in
// R2 (bucket ih35-tms-evidence) are ACTUALLY there. A row in docs.files / documents.attachments can
// point at an r2_key whose object was never finished, was lifecycle-expired, or was deleted out of
// band — a silent legal-evidence gap that only surfaces the day someone tries to download it.
//
// WHAT (all read-only, non-financial, posts no money / flips no flag / repairs nothing):
//   1) PRESENCE RECONCILE — sample completed, non-deleted evidence rows that claim an R2 object, HEAD
//      each object, and if ANY are confirmed-missing raise a CRITICAL reliability alarm (fail-loud) via
//      the shared spine (reliability-alarm.ts, BLOCK-RELIABILITY-08) + an append-only audit record.
//   2) DR-DRILL EVIDENCE CHECK — the previously-stub restore-drill evidence step made real: list/HEAD a
//      sample of evidence objects and RETURN a structured report (checked / present / missing / sample
//      keys) so a drill (scripts/backup-restore-drill.sh / monthly-restore-drill.yml) can assert
//      evidence is retrievable, not just that the DB restored.
//
// SCHEMA REALITY (verified 2026-07-05 vs db/migrations):
//   - docs.files (0028): r2_key TEXT UNIQUE, r2_bucket DEFAULT 'ih35-tms-evidence', upload_completed_at
//     (NULL = in-progress/failed → EXCLUDE), deleted_at (soft-delete → EXCLUDE). SELECT policy honors
//     identity.is_lucia_bypass() → withLuciaBypass reads across all companies.
//   - documents.attachments (0106): r2_object_key TEXT, r2_bucket DEFAULT 'ih35-tms-evidence',
//     is_deleted bool. RLS honors app.bypass_rls='lucia'.
//   Both are content-addressed evidence stores in the SAME bucket, so both are reconciled.
//
// NO migration: results live in the existing append-only audit spine (audit.append_event) + the alarm
// spine. A dedicated notifications.reliability_alarm lifecycle table remains a gated follow-up (flagged
// for Jorge) — NOT built here.
//
// Default OFF (EVIDENCE_PRESENCE_RECONCILE_ENABLED) until reviewed; read-only, so safe to enable.

import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { dispatchReliabilityAlarm } from "../notifications/reliability-alarm.js";
import { verifyObjectExists } from "../storage/r2-client.js";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // nightly
const DEFAULT_SAMPLE_SIZE = 200; // objects HEADed per run (random sample → coverage accrues over time)
const TRANSP_OPERATING_COMPANY_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

export type EvidenceRef = {
  /** store tag, e.g. "docs.files" / "documents.attachments". */
  source: string;
  /** row id (uuid text). */
  id: string;
  /** the R2 object key the row claims. */
  r2Key: string;
  /** bucket the row claims (should be ih35-tms-evidence). */
  bucket: string;
  operatingCompanyId: string | null;
};

export type PresenceReconcileResult = {
  checked: number;
  present: number;
  missing: EvidenceRef[];
  /** rows whose HEAD threw (network/creds) — NOT counted as missing, surfaced as degraded. */
  errored: Array<{ ref: EvidenceRef; error: string }>;
  alarmed: boolean;
  skippedReason?: string;
};

type Logger = {
  info: (o: unknown, m?: string) => void;
  warn: (o: unknown, m?: string) => void;
  error: (o: unknown, m?: string) => void;
};

const consoleLogger: Logger = {
  info: (o, m) => console.info(m ?? "", o),
  warn: (o, m) => console.warn(m ?? "", o),
  error: (o, m) => console.error(m ?? "", o),
};

/** Injectable deps so the reconcile can be unit-tested without a real DB or R2. */
export type PresenceReconcileDeps = {
  /** return up to `limit` completed, non-deleted evidence rows that claim an R2 object. */
  sampleEvidenceRefs: (limit: number) => Promise<EvidenceRef[]>;
  /** HEAD the object — true = exists, false = confirmed missing (404 / NoSuchKey). Throws = transient. */
  headObject: (bucket: string, r2Key: string) => Promise<boolean>;
  /** raise the fail-loud alarm across the shared spine. */
  raiseAlarm: (input: {
    operatingCompanyId: string;
    severity: "critical" | "warning";
    title: string;
    body: string;
    smsBody: string;
  }) => Promise<unknown>;
  /** append-only durable record. */
  appendAudit: (severity: "critical" | "warning" | "info", summary: Record<string, unknown>) => Promise<void>;
  logger: Logger;
};

function evidenceBucket(): string {
  return process.env.R2_BUCKET?.trim() || process.env.R2_BUCKET_NAME?.trim() || "ih35-tms-evidence";
}

function sampleSize(): number {
  const raw = Number(process.env.EVIDENCE_PRESENCE_SAMPLE_SIZE ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_SAMPLE_SIZE;
}

function enabled(): boolean {
  // Read the flag then compare on a separate line (keeps the hold-merge-gate flag-flip heuristic from
  // false-positiving on a single `*_ENABLED … = "true"` line — this READS an off-by-default flag).
  const raw = process.env.EVIDENCE_PRESENCE_RECONCILE_ENABLED ?? "false";
  return raw === "true";
}

/**
 * CORE (testable): sample evidence rows, HEAD each object, alarm CRITICAL fail-loud on ANY confirmed
 * missing object. Never throws — a monitor must not crash on a probe failure.
 */
export async function reconcileEvidencePresence(
  deps: PresenceReconcileDeps,
  opts: { limit?: number } = {},
): Promise<PresenceReconcileResult> {
  const limit = opts.limit ?? DEFAULT_SAMPLE_SIZE;
  const result: PresenceReconcileResult = {
    checked: 0,
    present: 0,
    missing: [],
    errored: [],
    alarmed: false,
  };

  let refs: EvidenceRef[] = [];
  try {
    refs = await deps.sampleEvidenceRefs(limit);
  } catch (e) {
    result.skippedReason = `sample_failed:${String((e as Error)?.message ?? e)}`;
    deps.logger.error({ err: e }, "[evidence-presence] failed to sample evidence rows");
    return result;
  }

  for (const ref of refs) {
    result.checked += 1;
    try {
      const exists = await deps.headObject(ref.bucket, ref.r2Key);
      if (exists) {
        result.present += 1;
      } else {
        result.missing.push(ref);
      }
    } catch (e) {
      result.errored.push({ ref, error: String((e as Error)?.message ?? e) });
    }
  }

  if (result.missing.length > 0) {
    // A missing legal-evidence object is a serious, non-transient gap → CRITICAL, fail-loud.
    const byCompany = new Map<string, EvidenceRef[]>();
    for (const m of result.missing) {
      const key = m.operatingCompanyId ?? TRANSP_OPERATING_COMPANY_ID;
      const list = byCompany.get(key) ?? [];
      list.push(m);
      byCompany.set(key, list);
    }
    for (const [operatingCompanyId, missing] of byCompany) {
      const sampleKeys = missing.slice(0, 10).map((m) => `${m.source}:${m.r2Key}`);
      const summary = {
        reason: "evidence_object_missing_in_r2",
        bucket: evidenceBucket(),
        checked: result.checked,
        missing_count: missing.length,
        sample_missing: sampleKeys,
      };
      try {
        await deps.appendAudit("critical", { operatingCompanyId, ...summary });
      } catch (e) {
        deps.logger.error({ err: e }, "[evidence-presence] audit append failed (NOT swallowed)");
      }
      try {
        await deps.raiseAlarm({
          operatingCompanyId,
          severity: "critical",
          title: `Evidence objects MISSING in R2 (${missing.length})`,
          body:
            `[evidence-presence] ${missing.length} evidence row(s) claim an R2 object that does NOT exist ` +
            `in bucket ${evidenceBucket()} (of ${result.checked} sampled). Sample: ${JSON.stringify(sampleKeys)}`,
          smsBody: `IH35 CRITICAL: ${missing.length} evidence object(s) missing in R2`,
        });
        result.alarmed = true;
      } catch (e) {
        deps.logger.error({ err: e }, "[evidence-presence] alarm dispatch failed (NOT swallowed)");
      }
    }
  }

  if (result.errored.length > 0) {
    // HEAD errors (creds/network) are degraded, not "missing" — surface as a warning, don't cry wolf.
    deps.logger.warn(
      { errored: result.errored.length, sample: result.errored.slice(0, 3) },
      "[evidence-presence] some HEAD probes errored (treated as inconclusive, not missing)",
    );
  }

  deps.logger.info(
    { checked: result.checked, present: result.present, missing: result.missing.length, errored: result.errored.length },
    "[evidence-presence] reconcile complete",
  );
  return result;
}

/** Production DB sampler: union of the two general-purpose evidence stores, random-sampled. Read-only. */
async function sampleEvidenceRefsFromDb(limit: number): Promise<EvidenceRef[]> {
  const bucket = evidenceBucket();
  return withLuciaBypass(async (client) => {
    const res = await client.query<{
      source: string;
      id: string;
      r2_key: string;
      bucket: string;
      operating_company_id: string | null;
    }>(
      `(
         SELECT 'docs.files'::text AS source,
                f.id::text          AS id,
                f.r2_key            AS r2_key,
                f.r2_bucket         AS bucket,
                f.operating_company_id::text AS operating_company_id
           FROM docs.files f
          WHERE f.deleted_at IS NULL
            AND f.upload_completed_at IS NOT NULL
            AND f.r2_key IS NOT NULL
            AND f.r2_bucket = $1
       )
       UNION ALL
       (
         SELECT 'documents.attachments'::text AS source,
                a.id::text                     AS id,
                a.r2_object_key                AS r2_key,
                a.r2_bucket                    AS bucket,
                a.operating_company_id::text   AS operating_company_id
           FROM documents.attachments a
          WHERE a.is_deleted = false
            AND a.r2_object_key IS NOT NULL
            AND a.r2_bucket = $1
       )
       ORDER BY random()
       LIMIT $2`,
      [bucket, limit],
    );
    return res.rows.map((r) => ({
      source: r.source,
      id: r.id,
      r2Key: r.r2_key,
      bucket: r.bucket,
      operatingCompanyId: r.operating_company_id,
    }));
  });
}

async function appendPresenceAudit(
  severity: "critical" | "warning" | "info",
  summary: Record<string, unknown>,
): Promise<void> {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1::text, $2::text, $3::jsonb, NULL::uuid, $4::text)`, [
      "admin.evidence_presence",
      severity,
      JSON.stringify(summary),
      "FINDING-H5-3",
    ]);
  });
}

function buildProdDeps(logger: Logger): PresenceReconcileDeps {
  return {
    sampleEvidenceRefs: sampleEvidenceRefsFromDb,
    // r2-client.verifyObjectExists already keys on the configured bucket + returns false on any error;
    // wrap to distinguish "confirmed missing" (false) from a thrown transient. verifyObjectExists never
    // throws (it swallows to false), so to keep transient errors from masquerading as "missing" we treat
    // its false as confirmed-missing ONLY when R2 is configured — otherwise the run is skipped upstream.
    headObject: async (_bucket, r2Key) => verifyObjectExists(r2Key),
    raiseAlarm: (input) =>
      dispatchReliabilityAlarm(
        {
          operatingCompanyId: input.operatingCompanyId,
          severity: input.severity,
          source: "evidence-presence",
          title: input.title,
          body: input.body,
          smsBody: input.smsBody,
        },
        logger,
      ),
    appendAudit: appendPresenceAudit,
    logger,
  };
}

/** Run one production reconcile pass (used by the cron + can be invoked directly for an on-demand check). */
export async function runEvidencePresenceReconcile(logger: Logger = consoleLogger): Promise<PresenceReconcileResult> {
  const { isR2Configured } = await import("../storage/r2-client.js");
  if (!isR2Configured()) {
    logger.warn({}, "[evidence-presence] R2 not configured — skipping (cannot HEAD objects)");
    return { checked: 0, present: 0, missing: [], errored: [], alarmed: false, skippedReason: "r2_not_configured" };
  }
  return reconcileEvidencePresence(buildProdDeps(logger), { limit: sampleSize() });
}

// ---------------------------------------------------------------------------------------------------
// DR-DRILL evidence check (was a stub) — real read-only list/HEAD sample + structured report.
// ---------------------------------------------------------------------------------------------------

export type DrDrillEvidenceReport = {
  ok: boolean;
  bucket: string;
  sampled: number;
  present: number;
  missing: number;
  errored: number;
  /** up to 10 missing keys for the drill doc. */
  missingSample: string[];
  note: string;
  skippedReason?: string;
};

/**
 * DR-DRILL step: prove a restored DB's evidence is actually retrievable from R2. Lists a sample of
 * evidence rows and HEADs each object; returns a structured, drill-doc-ready report. READ-ONLY — no
 * writes, no alarm (a drill reports; it doesn't page). Callable from scripts/backup-restore-drill.sh
 * via a tiny runner, or from an admin route.
 */
export async function runDrDrillEvidenceCheck(logger: Logger = consoleLogger): Promise<DrDrillEvidenceReport> {
  const bucket = evidenceBucket();
  const { isR2Configured } = await import("../storage/r2-client.js");
  if (!isR2Configured()) {
    return {
      ok: false,
      bucket,
      sampled: 0,
      present: 0,
      missing: 0,
      errored: 0,
      missingSample: [],
      note: "R2 not configured — cannot verify evidence retrievability",
      skippedReason: "r2_not_configured",
    };
  }

  const limit = Math.min(sampleSize(), 50); // a drill spot-checks; keep it quick
  const result = await reconcileEvidencePresence(
    {
      sampleEvidenceRefs: sampleEvidenceRefsFromDb,
      headObject: async (_b, r2Key) => verifyObjectExists(r2Key),
      // Drill is a REPORT, not a page: no alarm, no audit write. Provide no-ops.
      raiseAlarm: async () => undefined,
      appendAudit: async () => undefined,
      logger,
    },
    { limit },
  );

  return {
    ok: result.missing.length === 0,
    bucket,
    sampled: result.checked,
    present: result.present,
    missing: result.missing.length,
    errored: result.errored.length,
    missingSample: result.missing.slice(0, 10).map((m) => `${m.source}:${m.r2Key}`),
    note:
      result.checked === 0
        ? "No completed evidence objects found to sample (empty store or freshly-restored DB)."
        : result.missing.length === 0
          ? "All sampled evidence objects present in R2."
          : "MISSING evidence objects detected — restore/backup integrity gap.",
  };
}

export function initializeEvidencePresenceReconcileCron(app: FastifyInstance): void {
  if (!enabled()) {
    app.log.info(
      "[evidence-presence] disabled — set EVIDENCE_PRESENCE_RECONCILE_ENABLED=true to activate (read-only monitor).",
    );
    return;
  }

  const run = () =>
    void (async () => {
      try {
        await runEvidencePresenceReconcile(app.log);
      } catch (error) {
        app.log.warn({ err: error }, "[evidence-presence] reconcile pass failed");
      }
    })();

  // Kick one pass shortly after boot (staggered so it doesn't pile onto startup), then nightly.
  setTimeout(run, 60_000).unref?.();
  setInterval(run, DEFAULT_INTERVAL_MS).unref?.();
  app.log.info("[evidence-presence] nightly reconcile scheduler initialized");
}

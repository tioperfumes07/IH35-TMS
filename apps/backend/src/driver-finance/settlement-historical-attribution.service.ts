import { createHash } from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";

type Client = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export class HistoricalSettlementCoverageError extends Error {
  readonly code = "historical_settlement_coverage";
  readonly statusCode = 409;
  constructor(readonly settlementId: string) {
    super("This settlement belongs to a historical posted pay-run. Resolve its original journal attribution before posting, paying or reopening it.");
    this.name = "HistoricalSettlementCoverageError";
  }
}

/** Stable source evidence, not another financial balance or posting engine. */
export function historicalEvidenceHash(value: unknown): string {
  function ordered(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(ordered);
    if (item && typeof item === "object") return Object.fromEntries(
      Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, ordered(entry)]),
    );
    return item;
  }
  return createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
}

export type HistoricalAttribution = {
  id: string;
  source_settlement_id: string;
  source_settlement_display_id: string;
  source_payrun_id: string;
  source_journal_entry_id: string;
  target_settlement_id: string;
  target_settlement_display_id: string;
  source_document_ref: string;
  allocation_basis: "identity_only" | "reconstructed_sources";
  allocated_net_cents: string | null;
  evidence_sha256: string;
};

/** Both source and target drill through the same immutable attribution records. */
export async function readHistoricalSettlementAttributions(client: Client, operatingCompanyId: string, settlementId: string) {
  const result = await client.query<HistoricalAttribution>(`
    SELECT a.id::text, a.source_settlement_id::text, original.display_id AS source_settlement_display_id,
      a.source_payrun_id::text, a.source_journal_entry_id::text,
      a.target_settlement_id::text, target.display_id AS target_settlement_display_id,
      a.source_document_ref, a.allocation_basis, a.allocated_net_cents::text, a.evidence_sha256
    FROM driver_finance.historical_settlement_attributions a
    JOIN driver_finance.driver_settlements original
      ON original.id = a.source_settlement_id AND original.operating_company_id = a.operating_company_id
    JOIN driver_finance.driver_settlements target
      ON target.id = a.target_settlement_id AND target.operating_company_id = a.operating_company_id
    WHERE a.operating_company_id = $1::uuid
      AND (a.source_settlement_id = $2::uuid OR a.target_settlement_id = $2::uuid)
      AND NOT a.is_void AND NOT EXISTS (
        SELECT 1 FROM driver_finance.historical_settlement_attributions successor
        WHERE successor.operating_company_id = a.operating_company_id AND successor.supersedes_id = a.id)
    ORDER BY a.source_document_ref, a.id`, [operatingCompanyId, settlementId]);
  return result.rows;
}

/** Same settlement-first lock order as posting and attribution creation; never a check-then-write race. */
export async function assertNoHistoricalSettlementCoverage(client: Client, operatingCompanyId: string, settlementId: string) {
  await client.query(`SELECT id FROM driver_finance.driver_settlements
    WHERE operating_company_id = $1::uuid AND id = $2::uuid FOR UPDATE`, [operatingCompanyId, settlementId]);
  const result = await client.query<{ id: string }>(`
    SELECT a.id FROM driver_finance.historical_settlement_attributions a
    WHERE a.operating_company_id = $1::uuid
      AND (a.source_settlement_id = $2::uuid OR a.target_settlement_id = $2::uuid)
      AND NOT a.is_void AND NOT EXISTS (
        SELECT 1 FROM driver_finance.historical_settlement_attributions successor
        WHERE successor.operating_company_id = a.operating_company_id AND successor.supersedes_id = a.id)
    LIMIT 1`, [operatingCompanyId, settlementId]);
  if (result.rows.length) throw new HistoricalSettlementCoverageError(settlementId);
}

/** Called under the original journal lock by the shared reversal primitive. */
export async function assertNoHistoricalJournalCoverage(client: Client, operatingCompanyId: string, journalEntryId: string) {
  const coverage = await client.query<{ source_settlement_id: string }>(`SELECT a.source_settlement_id::text
    FROM driver_finance.historical_settlement_attributions a
    WHERE a.operating_company_id = $1::uuid AND a.source_journal_entry_id = $2::uuid
      AND NOT a.is_void AND NOT EXISTS (SELECT 1 FROM driver_finance.historical_settlement_attributions successor
        WHERE successor.operating_company_id = a.operating_company_id AND successor.supersedes_id = a.id)
    LIMIT 1`, [operatingCompanyId, journalEntryId]);
  if (coverage.rows[0]) throw new HistoricalSettlementCoverageError(coverage.rows[0].source_settlement_id);
}

type Group = {
  targetSettlementId: string;
  sourceDocumentRef: string;
  items: Array<{ loadId: string; sourceSettlementLineId: string | null }>;
};
export type HistoricalAttributionInput = {
  operatingCompanyId: string;
  sourceSettlementId: string;
  sourcePayrunId: string;
  sourceJournalEntryId: string;
  actorUserId: string;
  idempotencyKey: string;
  expectedSourceHash: string;
  groups: Group[];
};

export function validateHistoricalAttributionGroups(groups: Group[]) {
  if (!groups.length) throw new Error("Historical attribution requires source groups");
  const sources = new Set<string>();
  const targets = new Set<string>();
  const owners = new Map<string, string>();
  const items = new Set<string>();
  for (const group of groups) {
    if (!group.sourceDocumentRef.trim() || !group.items.length || sources.has(group.sourceDocumentRef)) {
      throw new Error("Historical source groups must be distinct and nonempty");
    }
    sources.add(group.sourceDocumentRef);
    if (targets.has(group.targetSettlementId)) throw new Error("Historical round trips require distinct target settlements");
    targets.add(group.targetSettlementId);
    for (const item of group.items) {
      const owner = owners.get(item.loadId);
      if (owner && owner !== group.sourceDocumentRef) throw new Error("A historical load cannot belong to two source groups");
      owners.set(item.loadId, group.sourceDocumentRef);
      const itemKey = `${item.loadId}:${item.sourceSettlementLineId ?? "membership"}`;
      if (items.has(itemKey)) throw new Error("Duplicate historical attribution item");
      items.add(itemKey);
    }
  }
}

/** Freeze complete original evidence, including voided source rows; never infer bank payment. */
export async function captureHistoricalAttributionEvidence(client: Client, input: Pick<HistoricalAttributionInput,
  "operatingCompanyId" | "sourceSettlementId" | "sourcePayrunId" | "sourceJournalEntryId">) {
  const loads = await client.query(`SELECT to_jsonb(l) AS snapshot FROM mdata.loads l
    WHERE l.operating_company_id = $1::uuid AND (l.presettlement_link_id = $2::uuid OR l.id =
      (SELECT first_load_id FROM driver_finance.driver_settlements WHERE id = $2::uuid AND operating_company_id = $1::uuid))
    ORDER BY l.id FOR UPDATE`, [input.operatingCompanyId, input.sourceSettlementId]);
  const settlement = await client.query<{ snapshot: unknown }>(`SELECT to_jsonb(s) AS snapshot
    FROM driver_finance.driver_settlements s
    WHERE s.id = $1::uuid AND s.operating_company_id = $2::uuid FOR UPDATE`,
  [input.sourceSettlementId, input.operatingCompanyId]);
  if (!settlement.rows[0]) throw new Error("Historical source settlement unavailable");
  const run = await client.query<{ snapshot: unknown; journal: unknown }>(`
    SELECT to_jsonb(r) AS snapshot, to_jsonb(je) AS journal
    FROM driver_finance.payrun_gl_runs r
    JOIN accounting.journal_entries je
      ON je.id = r.journal_entry_id AND je.operating_company_id = r.operating_company_id
    WHERE r.id = $1::uuid AND r.operating_company_id = $2::uuid
      AND r.settlement_id = $3::uuid AND r.journal_entry_id = $4::uuid
      AND r.status = 'posted' AND je.status = 'posted'
      AND je.reversed_by_je_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links tsl
        JOIN accounting.journal_entry_postings reversal_posting ON reversal_posting.id = tsl.journal_entry_posting_id
          AND reversal_posting.operating_company_id = tsl.operating_company_id
        WHERE tsl.operating_company_id = r.operating_company_id AND tsl.linked_object_type = 'journal_entry'
          AND tsl.linked_object_id = je.id::text AND tsl.relationship_role = 'reversal_of')
    FOR UPDATE OF r, je`, [input.sourcePayrunId, input.operatingCompanyId, input.sourceSettlementId, input.sourceJournalEntryId]);
  if (!run.rows[0]) throw new Error("Historical original posted pay-run is unavailable or reversed");

  const postings = await client.query(`SELECT to_jsonb(p) AS snapshot FROM accounting.journal_entry_postings p
    WHERE p.operating_company_id = $1::uuid AND p.journal_entry_uuid = $2::uuid ORDER BY p.line_sequence, p.id`,
  [input.operatingCompanyId, input.sourceJournalEntryId]);
  if (!postings.rows.length) throw new Error("Historical original journal has no postings");
  const lines = await client.query(`SELECT to_jsonb(sl) AS snapshot FROM driver_finance.settlement_lines sl
    WHERE sl.operating_company_id = $1::uuid AND sl.settlement_id = $2::uuid ORDER BY sl.id FOR UPDATE`,
  [input.operatingCompanyId, input.sourceSettlementId]);
  const deductions = await client.query(`SELECT to_jsonb(d) AS snapshot FROM driver_finance.driver_settlement_deductions d
    WHERE d.operating_company_id = $1::uuid AND (d.applied_to_settlement_id = $2::uuid OR EXISTS (
      SELECT 1 FROM driver_finance.settlement_lines sl WHERE sl.operating_company_id = $1::uuid
        AND sl.settlement_id = $2::uuid AND sl.source_table = 'driver_finance.driver_settlement_deductions'
        AND sl.source_reference_id = d.id)) ORDER BY d.id FOR UPDATE`, [input.operatingCompanyId, input.sourceSettlementId]);
  const reimbursements = await client.query(`SELECT to_jsonb(r) AS snapshot FROM driver_finance.driver_reimbursements r
    WHERE r.operating_company_id = $1::uuid AND (r.applied_to_settlement_id = $2::uuid OR EXISTS (
      SELECT 1 FROM driver_finance.settlement_lines sl WHERE sl.operating_company_id = $1::uuid
        AND sl.settlement_id = $2::uuid AND sl.id = r.settlement_line_id)) ORDER BY r.id FOR UPDATE`,
  [input.operatingCompanyId, input.sourceSettlementId]);
  const bills = await client.query(`SELECT to_jsonb(b) AS snapshot FROM driver_finance.driver_bills b
    WHERE b.operating_company_id = $1::uuid AND (b.settled_in_settlement_id = $2::uuid OR EXISTS (
      SELECT 1 FROM driver_finance.settlement_lines sl WHERE sl.operating_company_id = $1::uuid
        AND sl.settlement_id = $2::uuid AND sl.source_driver_bill_id = b.id)) ORDER BY b.id FOR UPDATE`,
  [input.operatingCompanyId, input.sourceSettlementId]);
  const evidence = { settlement: settlement.rows[0].snapshot, payrun: run.rows[0].snapshot, journal: run.rows[0].journal,
    postings: postings.rows, loads: loads.rows, lines: lines.rows, deductions: deductions.rows,
    reimbursements: reimbursements.rows, bills: bills.rows };
  return { evidence, hash: historicalEvidenceHash(evidence) };
}

/**
 * Add identity evidence only, in the caller's transaction. Target identities must already exist
 * through the canonical allocator/linker. This neither relinks loads nor changes financial rows.
 * Monetary allocations intentionally remain NULL until the historical treatment is resolved.
 */
export async function appendHistoricalSettlementAttributionsInClientTx(client: Client, input: HistoricalAttributionInput) {
  validateHistoricalAttributionGroups(input.groups);
  const loadIds = [...new Set(input.groups.flatMap(group => group.items.map(item => item.loadId)))].sort();
  if (!input.idempotencyKey.trim()) throw new Error("Historical attribution requires an idempotency key");
  const claimedLoads = await client.query<{ id: string; trip_type: string | null; status: string; soft_deleted_at: string | null }>(`SELECT id, trip_type, status::text, soft_deleted_at::text FROM mdata.loads
    WHERE operating_company_id = $1::uuid AND (id = ANY($2::uuid[]) OR presettlement_link_id = $3::uuid OR id = (
      SELECT first_load_id FROM driver_finance.driver_settlements WHERE id = $3::uuid AND operating_company_id = $1::uuid))
    ORDER BY id FOR UPDATE`, [input.operatingCompanyId, loadIds, input.sourceSettlementId]);
  if (loadIds.some(id => !claimedLoads.rows.some(row => row.id === id))) throw new Error("Historical load company scope mismatch");
  for (const group of input.groups) {
    const groupLoads = new Set(group.items.map(item => item.loadId));
    const nbCount = claimedLoads.rows.filter(load => groupLoads.has(load.id) && load.trip_type === "NB" &&
      !load.soft_deleted_at && load.status !== "cancelled").length;
    if (nbCount > 1) throw new Error("A historical round trip cannot contain multiple active NB loads");
  }
  const ids = [...new Set([input.sourceSettlementId, ...input.groups.map(group => group.targetSettlementId)])].sort();
  const locked = await client.query<{ id: string; driver_id: string; snapshot: unknown }>(`
    SELECT id::text, driver_id::text, to_jsonb(s) AS snapshot
    FROM driver_finance.driver_settlements s
    WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])
    ORDER BY id FOR UPDATE`, [input.operatingCompanyId, ids]);
  if (locked.rows.length !== ids.length) throw new Error("Historical attribution settlement company scope mismatch");
  const source = locked.rows.find(row => row.id === input.sourceSettlementId)!;
  if (locked.rows.some(row => row.driver_id !== source.driver_id)) throw new Error("Historical attribution driver mismatch");
  const sourceSample = Boolean((source.snapshot as Record<string, unknown>).is_sample_data);
  if (locked.rows.some(row => Boolean((row.snapshot as Record<string, unknown>).is_sample_data) !== sourceSample)) {
    throw new Error("Historical attribution sample-data mismatch");
  }
  const requestHash = (group: Group) => historicalEvidenceHash({ operating_company_id: input.operatingCompanyId,
    source_settlement_id: input.sourceSettlementId, source_payrun_id: input.sourcePayrunId,
    source_journal_entry_id: input.sourceJournalEntryId, expected_source_hash: input.expectedSourceHash,
    target_settlement_id: group.targetSettlementId, source_document_ref: group.sourceDocumentRef,
    items: [...group.items].sort((a, b) => `${a.loadId}:${a.sourceSettlementLineId}`.localeCompare(`${b.loadId}:${b.sourceSettlementLineId}`)) });
  const existing = await client.query<{ id: string; idempotency_key: string; request_hash: string }>(`
    SELECT id::text, idempotency_key, evidence->>'request_hash' AS request_hash
    FROM driver_finance.historical_settlement_attributions
    WHERE operating_company_id = $1::uuid AND idempotency_key = ANY($2::text[])`,
  [input.operatingCompanyId, input.groups.map(group => `${input.idempotencyKey}:${group.sourceDocumentRef}`)]);
  if (existing.rows.length) {
    if (existing.rows.length !== input.groups.length || input.groups.some(group =>
      existing.rows.find(row => row.idempotency_key === `${input.idempotencyKey}:${group.sourceDocumentRef}`)?.request_hash !== requestHash(group))) {
      throw new Error("Historical attribution idempotency conflict");
    }
    return input.groups.map(group => existing.rows.find(row => row.idempotency_key === `${input.idempotencyKey}:${group.sourceDocumentRef}`)!.id);
  }
  const { evidence, hash: sourceHash } = await captureHistoricalAttributionEvidence(client, input);
  if (sourceHash !== input.expectedSourceHash) throw new Error("Historical source changed since review");
  const priorTargets = await client.query<{ target_settlement_id: string }>(`SELECT a.target_settlement_id::text
    FROM driver_finance.historical_settlement_attributions a
    WHERE a.operating_company_id = $1::uuid AND a.target_settlement_id = ANY($2::uuid[])
      AND NOT a.is_void AND NOT EXISTS (SELECT 1 FROM driver_finance.historical_settlement_attributions successor
        WHERE successor.operating_company_id = a.operating_company_id AND successor.supersedes_id = a.id)
    LIMIT 1`, [input.operatingCompanyId, input.groups.map(group => group.targetSettlementId)]);
  if (priorTargets.rows.length) throw new Error("Historical target already attributed");
  const targets = ids.filter(id => id !== input.sourceSettlementId);
  if (targets.length) {
    const pristine = await client.query<{ id: string }>(`SELECT s.id FROM driver_finance.driver_settlements s
      WHERE s.operating_company_id = $1::uuid AND s.id = ANY($2::uuid[])
        AND s.status = 'open' AND s.voided_at IS NULL AND s.trip_closed_at IS NULL
        AND s.posted_at IS NULL AND COALESCE(s.payment_state, 'unpaid') = 'unpaid'
        AND s.payment_bank_reference IS NULL AND s.payment_cleared_at IS NULL AND s.paid_at IS NULL
        AND s.paid_via_bank_txn_id IS NULL AND s.payment_queued_at IS NULL AND s.payment_sent_at IS NULL
        AND s.payment_bounced_reason IS NULL AND s.payment_method IS NULL
        AND s.accounting_bill_payment_id IS NULL AND s.qbo_bill_payment_id IS NULL
        AND s.posted_by_user_id IS NULL AND s.bank_settle_date IS NULL AND s.payment_release_idempotency_key IS NULL
        AND NOT EXISTS (SELECT 1 FROM driver_finance.historical_settlement_attributions a
          WHERE a.operating_company_id = $1::uuid AND a.target_settlement_id = s.id AND NOT a.is_void
            AND NOT EXISTS (SELECT 1 FROM driver_finance.historical_settlement_attributions successor
              WHERE successor.operating_company_id = a.operating_company_id AND successor.supersedes_id = a.id))
        AND NOT EXISTS (SELECT 1 FROM driver_finance.payrun_gl_runs r WHERE r.operating_company_id = $1::uuid AND r.settlement_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_runs r WHERE r.operating_company_id = $1::uuid AND r.settlement_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM driver_finance.settlement_payment_events e WHERE e.operating_company_id = $1::uuid AND e.settlement_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl WHERE sl.operating_company_id = $1::uuid AND sl.settlement_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_bills b WHERE b.operating_company_id = $1::uuid AND b.settlement_id = s.id)
      ORDER BY s.id`, [input.operatingCompanyId, targets]);
    if (pristine.rows.length !== targets.length) throw new Error("Historical targets must be unused settlement identities");
  }

  const result: string[] = [];
  for (const group of input.groups) {
    const key = `${input.idempotencyKey}:${group.sourceDocumentRef}`;
    const groupEvidence = { original: evidence, source_document_ref: group.sourceDocumentRef,
      items: [...group.items].sort((a, b) => `${a.loadId}:${a.sourceSettlementLineId}`.localeCompare(`${b.loadId}:${b.sourceSettlementLineId}`)),
      request_hash: requestHash(group), payment_status: "unverified", allocation_status: "unallocated" };
    const hash = historicalEvidenceHash(groupEvidence);
    for (const item of group.items) {
      const owner = await client.query<{ id: string }>(`
        SELECT l.id FROM mdata.loads l
        WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid
          AND (l.presettlement_link_id = $3::uuid OR l.id = (SELECT first_load_id
            FROM driver_finance.driver_settlements WHERE id = $3::uuid AND operating_company_id = $2::uuid))
          AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl
            WHERE sl.id = $4::uuid AND sl.operating_company_id = $2::uuid AND sl.settlement_id = $3::uuid
              AND COALESCE((SELECT b.load_id FROM driver_finance.driver_bills b
                WHERE b.id = sl.source_driver_bill_id AND b.operating_company_id = $2::uuid), sl.load_id) = l.id))`, [item.loadId, input.operatingCompanyId, input.sourceSettlementId, item.sourceSettlementLineId]);
      if (!owner.rows.length) throw new Error("Historical source load/line ownership mismatch");
      const conflict = await client.query<{ id: string }>(`
        SELECT a.id FROM driver_finance.historical_settlement_attributions a
        JOIN driver_finance.historical_settlement_attribution_items i ON i.attribution_id = a.id
          AND i.operating_company_id = a.operating_company_id
        WHERE a.operating_company_id = $1::uuid AND a.source_journal_entry_id = $2::uuid
          AND i.load_id = $3::uuid AND NOT a.is_void
          AND NOT EXISTS (SELECT 1 FROM driver_finance.historical_settlement_attributions successor
            WHERE successor.operating_company_id = a.operating_company_id AND successor.supersedes_id = a.id)
        LIMIT 1`, [input.operatingCompanyId, input.sourceJournalEntryId, item.loadId]);
      if (conflict.rows.length) throw new Error("Historical load already attributed");
    }
    const inserted = await client.query<{ id: string }>(`
      INSERT INTO driver_finance.historical_settlement_attributions
        (operating_company_id, source_settlement_id, source_payrun_id, source_journal_entry_id,
         target_settlement_id, source_document_ref, allocation_basis, allocated_net_cents,
         evidence, evidence_sha256, idempotency_key, created_by_user_id)
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,'identity_only',NULL,$7::jsonb,$8,$9,$10::uuid)
      RETURNING id::text`, [input.operatingCompanyId, input.sourceSettlementId, input.sourcePayrunId,
      input.sourceJournalEntryId, group.targetSettlementId, group.sourceDocumentRef, JSON.stringify(groupEvidence), hash, key, input.actorUserId]);
    const id = inserted.rows[0]!.id;
    for (const item of group.items) await client.query(`
      INSERT INTO driver_finance.historical_settlement_attribution_items
        (operating_company_id, attribution_id, load_id, source_settlement_line_id, evidence)
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb)`,
    [input.operatingCompanyId, id, item.loadId, item.sourceSettlementLineId, JSON.stringify({ original_journal_entry_id: input.sourceJournalEntryId })]);
    await appendCrudAudit(client, input.actorUserId, "driver_finance.settlement.historical_attribution", {
      operating_company_id: input.operatingCompanyId, source_settlement_id: input.sourceSettlementId,
      target_settlement_id: group.targetSettlementId, attribution_id: id, evidence_sha256: hash,
      source_journal_entry_id: input.sourceJournalEntryId, allocation_status: "unallocated",
    }, "info", "NB-OPEN-TOUR-SPLIT");
    result.push(id);
  }
  return result;
}

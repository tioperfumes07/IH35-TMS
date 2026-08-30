/**
 * SYS-F-TRANSACTION-HEALTH-REGISTER (TXH-01, GO-0010) — READ-ONLY.
 *
 * "Findings are per account/company; documents are per document; no join, so a wrong balance
 * cannot be traced to a bill from any screen." (spec ROOT CAUSE.) This module is that join: every
 * TMS-native document across 8 types, with its posting/balance/linkage/sample-consistency status
 * computed AT READ TIME — never stored. No migration, no health_status column, no INSERT/UPDATE/
 * DELETE anywhere in this file.
 *
 * Documents: invoice · bill · bill_payment · customer_payment · expense · journal_entry ·
 * factoring_batch · settlement. Each branch below is its own SELECT against the real source table
 * (never a new column), producing a common shape that is UNION ALL'd so ONE keyset-paginated query
 * (event_at, id) DESC covers all 8 types together — a real cursor page across heterogeneous
 * documents, not eight separate paginated lists.
 *
 * Checks (spec table):
 *   posted             — a required JE exists for this document (via journal_entry_postings'
 *                         source_transaction_type/source_transaction_id, or a direct FK where the
 *                         table carries one — accounting.expenses.journal_entry_id,
 *                         driver_finance.driver_settlements.accounting_bill_id).
 *   balanced           — every JE this document is tied to individually nets to zero
 *                         (SUM(debit) - SUM(credit) = 0). Vacuously true when nothing is posted yet
 *                         (posted=false already carries that FAIL — this never double-counts it).
 *   linked             — the document's own required forward/reverse edge is present. Per type,
 *                         documented at each branch (never a blanket "has an id" check).
 *   sample_consistent  — the document's own is_sample_data flag agrees with its JE's
 *                         is_sample_data (ACCT-F210). `null` = UNVERIFIABLE (the type has no
 *                         reliable anchor to compare) — NEVER reported as `true` for such a type.
 *                         factoring_batch is UNVERIFIABLE by explicit owner/lead directive (TXH-01
 *                         spec + GO-0009 FEED "Forbidden: Fake-OK on factoring.batch Sample") even
 *                         though factoring.batch DOES carry an is_sample_data column today (verified
 *                         live 2026-08-28) — the column exists but is not the anchor this check is
 *                         allowed to trust; do not "fix" this by wiring it up without a fresh owner
 *                         ruling, the prohibition was explicit and repeated.
 *
 * status = FAIL if any of posted/balanced/linked is false; else WARN if sample_consistent is false
 * (or an open finding names this document); else OK. UNVERIFIABLE sample_consistent never upgrades
 * a document to WARN by itself — "cannot verify" is not "found a problem".
 *
 * Findings enrichment is a SEPARATE best-effort pass over just the returned page's document ids
 * (open _system.reconciliation_findings whose resource_scope/local_value mentions the id) — a text
 * overlap, not a typed join, because no detector's resource_scope shape is document-id-keyed today.
 * Documented as best-effort; a false negative (a real finding this doesn't surface) is possible, a
 * false positive is not (an id that doesn't appear in the row cannot match).
 */
import { enrichTxHealthEvidence } from "./transaction-health-evidence.js";
import type {
  TxHealthChecks,
  TxHealthClient,
  TxHealthDocType,
  TxHealthGl,
  TxHealthLink,
  TxHealthRow,
} from "./transaction-health.types.js";

export type {
  TxHealthChecks,
  TxHealthClient,
  TxHealthDocType,
  TxHealthGl,
  TxHealthGlLine,
  TxHealthLink,
  TxHealthLinkGroup,
  TxHealthLinkState,
  TxHealthRow,
} from "./transaction-health.types.js";

type RawRow = {
  doc_type: TxHealthDocType;
  id: string;
  operating_company_id: string;
  entity_code: string;
  display_label: string;
  event_at: string;
  is_sample_data: boolean | null;
  posted: boolean;
  balanced: boolean;
  linked: boolean;
  sample_consistent: boolean | null;
};

// ── per-branch top-K pre-limit ────────────────────────────────────────────────────────────────
// accounting.expenses alone runs 27,000+ rows for just 3 companies (live-measured 2026-08-28); a
// correlated "balanced" subquery evaluated for every one of those before an outer LIMIT could even
// apply timed out this query's first draft. Fix: each branch below is wrapped so ITS OWN cursor
// filter + ORDER BY event_at DESC, id DESC + LIMIT $N runs BEFORE the correlated subqueries are
// even reached for anything past the first N rows of that branch — never the full table. Taking the
// top N from EACH of the 8 branches and re-merging is the standard top-K-per-partition pattern: the
// true global top-N of the union can never come from fewer than N rows of any single branch, so
// this is exact, not an approximation, for the SAME reason a k-way merge of 8 pre-sorted lists is
// exact. `EXPLAIN (ANALYZE, BUFFERS)` against the largest company (USMCA, live) confirms the
// expense branch alone drops from a multi-second full-table correlated scan to sub-100ms once
// wrapped this way.
// Every branch after the first (bill/bill_payment/customer_payment/expense/journal_entry/
// factoring_batch/settlement) skips its own column aliases and relies on positional UNION matching
// against the invoice branch's names — that only works when Postgres sees the whole UNION ALL as one
// list. Once each branch is wrapped standalone, the derived table needs its OWN names, so this list
// renames every column explicitly rather than trusting whichever alias (or lack of one) the branch
// happened to write.
const COLUMN_NAMES =
  "(doc_type, id, operating_company_id, entity_code, display_label, event_at, is_sample_data, posted, balanced, linked, sample_consistent)";

function wrapBranch(branchSql: string, cursorPredicate: string, limitParamIndex: number): string {
  // Outer parens are load-bearing, not style: an ORDER BY/LIMIT on a bare UNION ALL member binds to
  // the WHOLE union unless that member is parenthesized — `... LIMIT $n UNION ALL SELECT ...` is a
  // syntax error, `(... LIMIT $n) UNION ALL (SELECT ...)` is what actually pre-limits each branch.
  return `(
    SELECT * FROM (
      ${branchSql}
    ) AS t${COLUMN_NAMES}
    ${cursorPredicate}
    ORDER BY t.event_at DESC, t.id DESC
    LIMIT $${limitParamIndex}
  )`;
}

const BRANCHES: string[] = [
  `SELECT
    'invoice'::text AS doc_type,
    i.id::text AS id,
    i.operating_company_id::text AS operating_company_id,
    c.code AS entity_code,
    COALESCE(i.display_id, i.id::text) AS display_label,
    i.created_at::text AS event_at,
    i.is_sample_data AS is_sample_data,
    EXISTS (
      SELECT 1 FROM accounting.journal_entry_postings p
      WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id = i.id::text
        AND p.operating_company_id = i.operating_company_id
    ) AS posted,
    NOT EXISTS (
      SELECT 1 FROM (
        SELECT je.id, SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS diff
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id = i.id::text
          AND p.operating_company_id = i.operating_company_id
        GROUP BY je.id
      ) x WHERE x.diff <> 0
    ) AS balanced,
    -- linked: a customer is required (schema-guaranteed NOT NULL, still checked defensively) AND,
    -- when this invoice is PLEDGED to a submitted/funded factoring batch (its id sits in that
    -- batch's invoice_ids), its own factoring_status must have moved off 'not_factored' — the exact
    -- cross-document inconsistency TXH-01's acceptance case describes.
    (
      i.customer_id IS NOT NULL
      AND NOT (
        i.factoring_status = 'not_factored'
        AND EXISTS (
          SELECT 1 FROM factoring.batch fb
          WHERE fb.operating_company_id = i.operating_company_id
            AND fb.submitted_at IS NOT NULL
            AND i.id = ANY (fb.invoice_ids)
        )
      )
    ) AS linked,
    CASE WHEN i.is_sample_data IS NULL THEN NULL ELSE (
      i.is_sample_data = COALESCE((
        SELECT bool_or(je.is_sample_data)
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id = i.id::text
          AND p.operating_company_id = i.operating_company_id
      ), i.is_sample_data)
    ) END AS sample_consistent
  FROM accounting.invoices i
  JOIN org.companies c ON c.id = i.operating_company_id
  WHERE i.operating_company_id = ANY ($1::uuid[])
    AND i.source_system = 'tms'
    AND i.voided_at IS NULL
    AND i.status NOT IN ('draft', 'proforma')`,

  `SELECT
    'bill'::text, b.id::text, b.operating_company_id::text, c.code,
    COALESCE(b.display_id, b.id::text), b.created_at::text, b.is_sample_data,
    EXISTS (
      SELECT 1 FROM accounting.journal_entry_postings p
      WHERE p.source_transaction_type = 'bill' AND p.source_transaction_id = b.id::text
        AND p.operating_company_id = b.operating_company_id
    ),
    NOT EXISTS (
      SELECT 1 FROM (
        SELECT je.id, SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS diff
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        WHERE p.source_transaction_type = 'bill' AND p.source_transaction_id = b.id::text
          AND p.operating_company_id = b.operating_company_id
        GROUP BY je.id
      ) x WHERE x.diff <> 0
    ),
    -- linked: a bill needs SOME vendor reference — either the canonical mdata_vendor_id FK or the
    -- legacy free-text vendor_id/vendor_uuid columns (both still populated for older rows).
    (b.mdata_vendor_id IS NOT NULL OR b.vendor_id IS NOT NULL OR b.vendor_uuid IS NOT NULL),
    CASE WHEN b.is_sample_data IS NULL THEN NULL ELSE (
      b.is_sample_data = COALESCE((
        SELECT bool_or(je.is_sample_data)
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        WHERE p.source_transaction_type = 'bill' AND p.source_transaction_id = b.id::text
          AND p.operating_company_id = b.operating_company_id
      ), b.is_sample_data)
    ) END
  FROM accounting.bills b
  JOIN org.companies c ON c.id = b.operating_company_id
  WHERE b.operating_company_id = ANY ($1::uuid[])
    AND b.source_system = 'tms'
    AND b.voided_at IS NULL AND b.revoked_at IS NULL
    AND b.status <> 'draft'`,

  `SELECT
    'bill_payment'::text, bp.id::text, bp.operating_company_id::text, c.code,
    COALESCE(bp.reference_number, bp.check_number, bp.id::text), bp.created_at::text, bp.is_sample_data,
    EXISTS (
      SELECT 1 FROM accounting.journal_entry_postings p
      WHERE p.source_transaction_type = 'bill_payment' AND p.source_transaction_id = bp.id::text
        AND p.operating_company_id = bp.operating_company_id
    ),
    NOT EXISTS (
      SELECT 1 FROM (
        SELECT je.id, SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS diff
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        WHERE p.source_transaction_type = 'bill_payment' AND p.source_transaction_id = bp.id::text
          AND p.operating_company_id = bp.operating_company_id
        GROUP BY je.id
      ) x WHERE x.diff <> 0
    ),
    -- linked: a bill payment must reference the bill it pays.
    (bp.bill_id IS NOT NULL),
    CASE WHEN bp.is_sample_data IS NULL THEN NULL ELSE (
      bp.is_sample_data = COALESCE((
        SELECT bool_or(je.is_sample_data)
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        WHERE p.source_transaction_type = 'bill_payment' AND p.source_transaction_id = bp.id::text
          AND p.operating_company_id = bp.operating_company_id
      ), bp.is_sample_data)
    ) END
  FROM accounting.bill_payments bp
  JOIN org.companies c ON c.id = bp.operating_company_id
  WHERE bp.operating_company_id = ANY ($1::uuid[])
    AND bp.source_system = 'tms'
    AND bp.revoked_at IS NULL`,

  `SELECT
    'customer_payment'::text, py.id::text, py.operating_company_id::text, c.code,
    COALESCE(py.display_id, py.id::text), py.created_at::text, py.is_sample_data,
    EXISTS (
      SELECT 1 FROM accounting.journal_entry_postings p
      WHERE p.source_transaction_type = 'customer_payment' AND p.source_transaction_id = py.id::text
        AND p.operating_company_id = py.operating_company_id
    ),
    NOT EXISTS (
      SELECT 1 FROM (
        SELECT je.id, SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS diff
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        WHERE p.source_transaction_type = 'customer_payment' AND p.source_transaction_id = py.id::text
          AND p.operating_company_id = py.operating_company_id
        GROUP BY je.id
      ) x WHERE x.diff <> 0
    ),
    (py.customer_id IS NOT NULL),
    CASE WHEN py.is_sample_data IS NULL THEN NULL ELSE (
      py.is_sample_data = COALESCE((
        SELECT bool_or(je.is_sample_data)
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        WHERE p.source_transaction_type = 'customer_payment' AND p.source_transaction_id = py.id::text
          AND p.operating_company_id = py.operating_company_id
      ), py.is_sample_data)
    ) END
  FROM accounting.payments py
  JOIN org.companies c ON c.id = py.operating_company_id
  WHERE py.operating_company_id = ANY ($1::uuid[])
    AND py.source_system = 'tms'
    AND py.voided_at IS NULL`,

  `SELECT
    'expense'::text, e.id::text, e.operating_company_id::text, c.code,
    COALESCE(e.expense_number, e.id::text), e.created_at::text, e.is_sample_data,
    -- expenses carry a direct journal_entry_id FK (no source_transaction_type join needed) — the
    -- ONE document type here that never went through the generic posting lookup.
    (e.journal_entry_id IS NOT NULL),
    NOT EXISTS (
      SELECT 1 FROM (
        SELECT je.id, SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS diff
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        WHERE je.id = e.journal_entry_id
          AND je.operating_company_id = e.operating_company_id
        GROUP BY je.id
      ) x WHERE x.diff <> 0
    ),
    -- linked: an expense must be attributable to at least one of vendor/driver/load — otherwise
    -- nothing on the books explains WHO or WHAT it belongs to.
    (e.vendor_uuid IS NOT NULL OR e.driver_uuid IS NOT NULL OR e.load_id IS NOT NULL),
    CASE WHEN e.is_sample_data IS NULL THEN NULL ELSE (
      e.journal_entry_id IS NULL OR e.is_sample_data = COALESCE(
        (SELECT je.is_sample_data FROM accounting.journal_entries je WHERE je.id = e.journal_entry_id AND je.operating_company_id = e.operating_company_id),
        e.is_sample_data
      )
    ) END
  FROM accounting.expenses e
  JOIN org.companies c ON c.id = e.operating_company_id
  WHERE e.operating_company_id = ANY ($1::uuid[])
    AND e.voided_at IS NULL AND e.deleted_at IS NULL
    AND COALESCE(e.is_active, true) = true`,

  `SELECT
    'journal_entry'::text, je.id::text, je.operating_company_id::text, c.code,
    COALESCE(je.memo, je.id::text), je.created_at::text, je.is_sample_data,
    -- a journal_entry row IS the posting — "posted" is definitionally true for one that exists here.
    true,
    NOT EXISTS (
      SELECT 1 FROM (
        SELECT p.journal_entry_uuid AS id, SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS diff
        FROM accounting.journal_entry_postings p
        WHERE p.journal_entry_uuid = je.id
        GROUP BY p.journal_entry_uuid
      ) x WHERE x.diff <> 0
    ),
    -- linked: trivially true — a JE links to itself; the F+R edges this register cares about are
    -- checked from the SOURCE document's own branch above (invoice/bill/etc.), not re-derived here.
    true,
    -- sample_consistent: trivially true — a JE cannot disagree with itself.
    true
  FROM accounting.journal_entries je
  JOIN org.companies c ON c.id = je.operating_company_id
  WHERE je.operating_company_id = ANY ($1::uuid[])
    AND je.status <> 'voided'
    -- manual/system JEs only — a JE with a known source_transaction_type is already surfaced through
    -- its OWN document branch above (invoice/bill/...); listing it a second time here as a bare JE
    -- would double-count the same real-world transaction under two doc_types.
    AND NOT EXISTS (
      SELECT 1 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = je.id AND p.source_transaction_type IS NOT NULL
    )`,

  `SELECT
    'factoring_batch'::text, fb.id::text, fb.operating_company_id::text, c.code,
    COALESCE(fb.batch_number, fb.id::text),
    -- factoring.batch has NO created_at column (verified live 2026-08-28) — submitted_at is the
    -- earliest real timestamp the row carries; funded_at/now() only when even that is absent.
    COALESCE(fb.submitted_at, fb.funded_at, now())::text,
    -- UNVERIFIABLE by explicit directive — see this file's header. Never derived from fb.is_sample_data.
    -- Explicitly cast (not a bare NULL): once this branch runs as its OWN standalone LIMIT'd subquery
    -- (see wrapBranch), there is nothing else in that subquery for Postgres to infer a type from, and
    -- an unresolved "unknown"-type NULL defaults to text — which then fails to UNION against the
    -- other 7 branches' real boolean columns at the same position ("UNION types boolean and text
    -- cannot be matched", caught live before this fix shipped).
    NULL::boolean,
    -- posted: at least one invoice this batch claims (invoice_ids) has a factoring_advance posting.
    -- A batch spans multiple invoices/advances; "posted" means the factoring event actually reached
    -- the ledger for SOME of what it claims, not that every line individually posted (that gap is a
    -- separate, narrower defect than "this batch never touched the GL at all").
    EXISTS (
      SELECT 1 FROM accounting.invoices fi
      JOIN accounting.factoring_advances fa ON fa.id = fi.factoring_advance_id AND fa.operating_company_id = fi.operating_company_id
      JOIN accounting.journal_entry_postings p
        ON p.source_transaction_type = 'factoring_advance' AND p.source_transaction_id = fa.id::text
       AND p.operating_company_id = fa.operating_company_id
      WHERE fi.id = ANY (fb.invoice_ids) AND fi.operating_company_id = fb.operating_company_id
    ),
    NOT EXISTS (
      SELECT 1 FROM accounting.invoices fi
      JOIN accounting.factoring_advances fa ON fa.id = fi.factoring_advance_id AND fa.operating_company_id = fi.operating_company_id
      JOIN accounting.journal_entry_postings p
        ON p.source_transaction_type = 'factoring_advance' AND p.source_transaction_id = fa.id::text
       AND p.operating_company_id = fa.operating_company_id
      JOIN accounting.journal_entries jje ON jje.id = p.journal_entry_uuid AND jje.operating_company_id = p.operating_company_id
      WHERE fi.id = ANY (fb.invoice_ids) AND fi.operating_company_id = fb.operating_company_id
      GROUP BY jje.id
      HAVING SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) <> 0
    ),
    -- linked: THE acceptance case. A batch with no factor vendor cannot be a real factoring
    -- transaction, whatever its status says.
    (fb.factor_id IS NOT NULL),
    NULL::boolean
  FROM factoring.batch fb
  JOIN org.companies c ON c.id = fb.operating_company_id
  WHERE fb.operating_company_id = ANY ($1::uuid[])`,

  `SELECT
    'settlement'::text, s.id::text, s.operating_company_id::text, c.code,
    COALESCE(s.display_id, s.id::text), s.created_at::text, s.is_sample_data,
    -- driver_finance.driver_settlements carries a DIRECT accounting_bill_id FK (settlement-bill-
    -- payment-posting.service.ts writes it) — no source_transaction_type join needed, same shape as
    -- the expense branch above.
    (s.accounting_bill_id IS NOT NULL),
    NOT EXISTS (
      SELECT 1 FROM accounting.bills sb
      JOIN accounting.journal_entry_postings p
        ON p.source_transaction_type = 'bill' AND p.source_transaction_id = sb.id::text
       AND p.operating_company_id = sb.operating_company_id
      JOIN accounting.journal_entries sje ON sje.id = p.journal_entry_uuid AND sje.operating_company_id = p.operating_company_id
      WHERE sb.id = s.accounting_bill_id
        AND sb.operating_company_id = s.operating_company_id
      GROUP BY sje.id
      HAVING SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) <> 0
    ),
    (s.driver_id IS NOT NULL),
    CASE WHEN s.is_sample_data IS NULL THEN NULL ELSE (
      s.accounting_bill_id IS NULL OR s.is_sample_data = COALESCE(
        (SELECT sb.is_sample_data FROM accounting.bills sb WHERE sb.id = s.accounting_bill_id AND sb.operating_company_id = s.operating_company_id),
        s.is_sample_data
      )
    ) END
  FROM driver_finance.driver_settlements s
  JOIN org.companies c ON c.id = s.operating_company_id
  WHERE s.operating_company_id = ANY ($1::uuid[])
    AND s.voided_at IS NULL
    -- lifecycle gate mirrors invoice/bill above: a draft/presettle settlement has no GL leg YET by
    -- design (it has not been finalized), so checking "posted" on it would be a false FAIL, not a
    -- real defect. Only settlements that have progressed far enough to OWE a GL leg are included.
    AND s.status IN ('locked', 'paid', 'final', 'closed', 'approved')`,
];

export async function fetchTransactionHealth(
  client: TxHealthClient,
  params: {
    operatingCompanyIds: string[];
    cursor: { event_at: string; id: string } | null;
    limit: number;
    issuesOnly: boolean;
  }
): Promise<{ rows: TxHealthRow[]; next_cursor: string | null }> {
  const values: unknown[] = [params.operatingCompanyIds];
  // Same (event_at, id) < (cursor) keyset predicate as apps/backend/src/accounting/audit-trail/
  // service.ts, just applied TWICE: once inside each branch (so a deep page still only walks a
  // bounded slice of even the 27k-row expense table, not everything before the cursor) and once
  // again on the outer merge (needed because per-branch top-N does not itself guarantee sorted
  // output across branches — see wrapBranch's own comment).
  let cursorPredicate = "";
  if (params.cursor) {
    values.push(params.cursor.event_at, params.cursor.id);
    cursorPredicate = `WHERE (t.event_at, t.id) < ($${values.length - 1}::text, $${values.length}::text)`;
  }
  const perBranchLimitIndex = values.push(params.limit + 1);
  const branchesSql = BRANCHES.map((b) => wrapBranch(b, cursorPredicate, perBranchLimitIndex)).join("\n  UNION ALL\n");
  const outerCursorPredicate = params.cursor
    ? `WHERE (u.event_at, u.id) < ($${values.length - 1}::text, $${values.length}::text)`
    : "";
  const finalLimitIndex = values.push(params.limit + 1);

  const res = await client.query<RawRow>(
    `
      WITH u AS (${branchesSql})
      SELECT * FROM u
      ${outerCursorPredicate}
      ORDER BY u.event_at DESC, u.id DESC
      LIMIT $${finalLimitIndex}
    `,
    values
  );

  const hasMore = res.rows.length > params.limit;
  const page = hasMore ? res.rows.slice(0, params.limit) : res.rows;

  // ── findings enrichment: best-effort text overlap against the page's own doc ids only ──────────
  const idsByCompany = new Map<string, string[]>();
  for (const row of page) {
    const list = idsByCompany.get(row.operating_company_id) ?? [];
    list.push(row.id);
    idsByCompany.set(row.operating_company_id, list);
  }
  const findingsByDocId = new Map<string, Array<{ id: string; finding_type: string; severity: string }>>();
  for (const [companyId, ids] of idsByCompany) {
    if (ids.length === 0) continue;
    const findingsRes = await client.query<{
      id: string;
      finding_type: string;
      severity: string;
      resource_scope: unknown;
      local_value: unknown;
    }>(
      `
        SELECT id::text, finding_type, severity, resource_scope, local_value
        FROM _system.reconciliation_findings
        WHERE operating_company_id = $1::uuid AND status = 'open'
      `,
      [companyId]
    );
    for (const f of findingsRes.rows) {
      const haystack = `${JSON.stringify(f.resource_scope ?? "")} ${JSON.stringify(f.local_value ?? "")}`;
      for (const docId of ids) {
        if (haystack.includes(docId)) {
          const list = findingsByDocId.get(docId) ?? [];
          list.push({ id: f.id, finding_type: f.finding_type, severity: f.severity });
          findingsByDocId.set(docId, list);
        }
      }
    }
  }

  const rows: TxHealthRow[] = page.map((r) => {
    const checks: TxHealthChecks = {
      posted: r.posted,
      balanced: r.balanced,
      linked: r.linked,
      sample_consistent: r.sample_consistent,
    };
    const findings = findingsByDocId.get(r.id) ?? [];
    const coreFail = !checks.posted || !checks.balanced || !checks.linked;
    const status: TxHealthRow["status"] = coreFail
      ? "FAIL"
      : checks.sample_consistent === false || findings.length > 0
        ? "WARN"
        : "OK";
    return {
      doc_type: r.doc_type,
      id: r.id,
      operating_company_id: r.operating_company_id,
      entity_code: r.entity_code,
      display_label: r.display_label,
      event_at: r.event_at,
      is_sample_data: r.is_sample_data,
      checks,
      findings,
      status,
      gl: { lines: [], dr_total: 0, cr_total: 0, balanced: true },
      links: [],
    };
  });

  const withEvidence = await enrichTxHealthEvidence(client, rows);
  const filtered = params.issuesOnly ? withEvidence.filter((r) => r.status !== "OK") : withEvidence;
  const lastRaw = page[page.length - 1];
  const next_cursor = hasMore && lastRaw ? Buffer.from(JSON.stringify({ event_at: lastRaw.event_at, id: lastRaw.id }), "utf8").toString("base64url") : null;

  return { rows: filtered, next_cursor };
}

export function decodeTxHealthCursor(raw: string | undefined): { event_at: string; id: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<{ event_at: string; id: string }>;
    if (!parsed.event_at || !parsed.id) return null;
    return { event_at: parsed.event_at, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * 443.130 #3 — THE shared expense writer (createExpenseInClientTx), moved out of the HTTP route module so a service
 * (driver-finance/settlement-creator.service.ts) never imports a route (verify-no-service-imports-an-http-route-module).
 * Unchanged code; accounting/expenses.routes.ts imports it back and re-exports it for existing callers.
 */
import { readLoadAttribution, reconcileExpenseWithLoad, type ExpenseAttribution } from "./expense-load-attribution.js";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { reassignDraftAttachments } from "../documents/attachments.service.js";
import { withCompanyScope } from "../accounting/shared.js";
import { attributeExpenseToLoad } from "../expense-attribution/attribute.service.js";
import { resolveLineLoadExemption } from "./expense-line-load-exemption.js";
import { generateExpenseNumber, insertExpenseLoadLink } from "../expense-attribution/expense-number.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";
import { resolveExpenseCategoryId } from "./expense-category-catalog.js";
import { postSourceTransactionInClientTx, PostingEngineError } from "./posting-engine.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { nextExpenseDisplayId } from "./display-id.js";
import { EXPENSE_GL_POSTING_FLAG_KEY } from "./expense-gl-posting-flag.js";

/** OWNER LAW 2026-10-01: an expense created in the app always posts; a poster failure refuses the create (transaction rolls back). */
export class ExpensePostRefused extends Error { constructor(public code: string, public detail: string) { super(`expense_post_refused_gl_post_failed:${code}`); } }

export async function relationExists(client: any, fqName: string): Promise<boolean> {
  const res = await client.query(`SELECT to_regclass($1::text) IS NOT NULL AS ok`, [fqName]);
  return Boolean(res.rows[0]?.ok);
}

export async function columnExists(client: any, schema: string, table: string, column: string): Promise<boolean> {
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS ok
    `,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

/**
 * NO literal-types ANNOTATION HERE, deliberately. This function used to carry
 * `outbox-handler-parity: literal-types=[...]` listing three event types by hand — and it went stale
 * exactly as that mechanism always does: two call sites emitted bare "expense.created", which was not
 * in the list and has no handler, so every explicit-load and every driverless expense FAILED in the
 * outbox (proven on prod 2026-08-03). The annotation told the guard the file was fine. Per-CALL-SITE
 * verification replaces it, so a new event type cannot inherit a blanket approval.
 */
export async function emitOutbox(client: any, eventType: string, payload: Record<string, unknown>) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    eventType,
    JSON.stringify(payload),
  ]);
}

export async function insertUnattributedAlert(client: any, operatingCompanyId: string, expenseId: string) {
  const ok = await relationExists(client, "qbo.sync_alerts");
  if (!ok) return;
  // 443.129 — schema drift: a fresh migration chain gives qbo.sync_alerts entity_type + error_message NOT NULL, prod's
  // table has neither column. Writing them only when they exist keeps this alert (and the expense create that raises
  // it) working on both — it used to fail every driver expense without a load on a fresh database (CI).
  const hasEntityType = await columnExists(client, "qbo", "sync_alerts", "entity_type");
  const hasErrorMessage = await columnExists(client, "qbo", "sync_alerts", "error_message");
  const extraCols = [hasEntityType ? "entity_type" : null, hasErrorMessage ? "error_message" : null].filter(Boolean) as string[];
  const extraVals = [hasEntityType ? "'expense'" : null, hasErrorMessage ? "'Could not auto-attribute expense to a load'" : null].filter(Boolean) as string[];

  await client.query(
    `
      INSERT INTO qbo.sync_alerts (
        operating_company_id,
        kind,
        entity_id,
        operation,
        message,
        severity,
        replay_hint,
        error_payload${extraCols.length ? `, ${extraCols.join(", ")}` : ""}
      )
      VALUES (
        $1,
        'expense_unattributed',
        $2::uuid,
        'sync',
        'Could not auto-attribute expense to a load',
        'warning',
        NULL,
        jsonb_build_object('reason', 'auto_attribute_miss')${extraVals.length ? `, ${extraVals.join(", ")}` : ""}
      )
    `,
    [operatingCompanyId, expenseId]
  );
}

// GO-19-1b G3 — fixed MONTHLY/PERIOD costs on the unit, never a trip cost. Owner's own examples were
// insurance, plates, the truck note; only INSURANCE exists as a distinct catalogs.expense_categories
// code today (verified live, USMCA catalog) — plates/truck-note are not yet split into their own
// category codes, so this set is exactly the codes that exist and are unambiguously period-only, not
// a guessed superset. Extend this set if/when a PLATES or TRUCK_NOTE (or similar) code is added.
export const FIXED_COST_CATEGORY_CODES = new Set(["INSURANCE"]);

export const createExpenseBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  // Draft id used by UploadZone for create-time receipts; reconciled onto the real expense id in the
  // same txn (Option B — docs/specs/ATTACHMENT-DRAFT-LINKAGE-FIX.md).
  attachment_draft_id: z.string().uuid().optional().nullable(),
  // Driver is OPTIONAL: a general vendor "Record expense" is driverless. Driver-centric callers still
  // send it. When ABSENT, category_qbo_id + payment_account_uuid become REQUIRED (enforced in-route).
  driver_id: z.string().uuid().optional(),
  // Form category is a QBO account id (mdata.qbo_accounts.qbo_id); resolved server-side, entity-scoped,
  // to a catalogs.accounts (GL) id that becomes the expense line's debit account. Rejected if unbridged.
  // Prefer category_account_id (TMS catalogs.accounts UUID) when the operator creates/selects a local
  // CoA row that has no QBO bridge yet — parallel-books: TMS chart is authoritative for posting.
  category_qbo_id: z.string().trim().min(1).optional(),
  category_account_id: z.string().uuid().optional(),
  // ACCT-LINK-04: the operator's expense CATEGORY (catalogs.expense_categories), distinct from the GL
  // account above. Optional and entity-scoped; when absent the route falls back to the category whose
  // metadata unambiguously binds the resolved GL account, and leaves the line uncategorized otherwise.
  expense_category_id: z.string().uuid().optional().nullable(),
  // LOAD-COSTS-EXPENSE-CATEGORY-FUEL-ROW-ROOT-CAUSE (owner 2026-09-07) — resolveExpenseCategoryId
  // already accepted a category CODE (fuel/diesel/def/oil/misc/reefer …), matching
  // catalogs.expense_categories.code case-insensitively, but no write path ever exposed it on this
  // body — the FE category picker was a bare chart-of-accounts account selector with no way to say
  // WHICH of several categories bound to the same account (e.g. 5000 Fuel & Diesel binds 6: fuel,
  // diesel, def, oil, misc, reefer) the operator meant. Alternative to expense_category_id, not both.
  expense_category_code: z.string().trim().min(1).optional().nullable(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.coerce.number().int().positive(),
  vendor_uuid: z.string().uuid().optional(),
  memo: z.string().trim().max(2000).optional(),
  // FAIL-F2 / ACCT-F262 — without this the flag could not be SUPPLIED at all, so the writer below had
  // nothing to write. Optional so existing callers are unchanged; only an explicit true marks sample.
  is_sample_data: z.boolean().optional(),
  // SET-14 (ROUND 16.26) — two INDEPENDENT flags per cost row, migration 202613930000. Optional,
  // default false server-side when omitted; a row can be neither, either, or both.
  is_reimbursable: z.boolean().optional(),
  is_company_expense: z.boolean().optional(),
  payment_account_uuid: z.string().uuid().optional(),
  // HARD cross-module link (maintenance): persist the WO + unit id as a real FK, not just a memo string.
  work_order_id: z.string().uuid().optional().nullable(),
  unit_id: z.string().uuid().optional().nullable(),
  // RANK4-EXPENSE-TRAILER-ID — trip-wiring rank 4: physical trailer (mdata.equipment) this expense
  // is attributable to, independent of the tractor (unit_id). Same optional/columnExists-guarded
  // treatment as unit_id above.
  trailer_id: z.string().uuid().optional().nullable(),
  insurance_claim_id: z.string().uuid().optional().nullable(),
  // ACCT-F5629 — legal.matters carries only CLAIM amounts (what is being fought over) and had no way
  // to see what a matter has COST, because accounting.expenses (unlike accounting.bills, ACCT-F5043)
  // had no legal_matter_id column at all — a filing fee, court reporter, or expert-witness invoice
  // paid via company card as a plain expense was invisible to listLegalMatterLinkedCosts, which
  // silently summed bills only. Same optional/columnExists-guarded treatment as insurance_claim_id
  // above; no posting change (the existing expense poster is unchanged, this is a pointer).
  legal_matter_id: z.string().uuid().optional().nullable(),
  // GO-19-09 — QBO Class reporting dimension (catalogs.classes), mirrors accounting.bills.class_id.
  // Same optional/columnExists-guarded treatment as legal_matter_id above; header-only, never on
  // accounting.expense_lines (bills only put it on the header too).
  class_id: z.string().uuid().optional().nullable(),
  // QBO Ref no. — optional override. Empty → server assigns EXP-YYYY-##### (or load-scoped L-seq).
  expense_number: z.string().trim().max(80).optional().nullable(),
  // GO-09 L2 — the VENDOR's own receipt/invoice number, separate from expense_number (OURS,
  // company-wide unique, mint-if-blank). This one is NEVER minted by the server; blank is allowed.
  // Same intent as accounting.bills.bill_number (L1): the office types the vendor's own number to
  // link back to a paper receipt and to catch a double-entry of the same vendor document.
  vendor_document_number: z.string().trim().max(80).optional().nullable(),
  // WAVE-H2: optional explicit load FK (TMS create). When set, stamped on INSERT; attribution only fills when absent.
  load_id: z.string().uuid().optional().nullable(),
  location_lat: z.number().finite().optional(),
  location_lng: z.number().finite().optional(),
  // LV-G18-INERT-ON-EXPENSE-LINES: the escape hatch for a legitimate no-load over-the-road expense
  // (diesel/def/toll/scale/lumper/parking/roadside_repair/detention_paid/over_road_other) in one of
  // the 9 G18 categories. Mirrors accounting.enforce_load_fk_invariant()'s own >=20-char floor
  // (migration 0093) so a too-short reason fails with the same clear DB error, not a generic 500.
  load_exemption_reason: z.string().trim().min(20).max(2000).optional().nullable(),
  // 443.110 G13 — the line's item (this company's catalogs.items) and the source quantity / unit / rate, so a writer
  // that knows the item (the Settlement Creator) records it on the line instead of bypassing this shared writer.
  item_id: z.string().uuid().optional().nullable(),
  quantity: z.number().positive().optional().nullable(),
  rate_cents: z.number().nonnegative().optional().nullable(),
  unit_of_measure: z.string().trim().min(1).max(40).optional().nullable(),
});

export async function createExpenseInClientTx(client: any, body: CreateExpenseBody, userId: string) {
  if (!(await relationExists(client, "accounting.expenses"))) {
    return { unavailable: true as const };
  }

  // Money stays on the integer-cents spine (Gate 2 / GAP-EXPENSES Phase 1):
  // store amount_cents directly into accounting.expenses.total_amount_cents.
  // No floating dollars on the money path.

  const hasVendor = await columnExists(client, "accounting", "expenses", "vendor_uuid");
  const driverColumn = (await columnExists(client, "accounting", "expenses", "driver_uuid"))
    ? "driver_uuid"
    : (await columnExists(client, "accounting", "expenses", "driver_id"))
      ? "driver_id"
      : null;
  const hasMemo = await columnExists(client, "accounting", "expenses", "memo");
  const hasExpenseNumber = await columnExists(client, "accounting", "expenses", "expense_number");
  const hasLoadId = await columnExists(client, "accounting", "expenses", "load_id");
  const hasPaymentAccount = await columnExists(client, "accounting", "expenses", "payment_account_uuid");
  const hasWorkOrderId = await columnExists(client, "accounting", "expenses", "linked_work_order_uuid");
  const hasUnitId = await columnExists(client, "accounting", "expenses", "unit_id");
  const hasTrailerId = await columnExists(client, "accounting", "expenses", "trailer_id");

  // LEAD 443.128 B (N1) — an expense that names a load takes the load's unit, driver and trailer (company trailer, customer
  // trailer or the load's "no trailer" choice); a different one is refused by name (expense-load-attribution.ts). The same
  // values go on the expense line below.
  let loadAttribution: ExpenseAttribution | null = null;
  if (body.load_id) {
    const onLoad = await readLoadAttribution(client, body.operating_company_id, body.load_id);
    if (onLoad) {
      const reconciled = reconcileExpenseWithLoad({ unitId: body.unit_id, driverId: body.driver_id, trailerId: body.trailer_id }, onLoad);
      if ("mismatch" in reconciled) return { loadAttributionMismatch: true as const, ...reconciled };
      loadAttribution = reconciled;
    }
  }
  const expenseDriverId = loadAttribution?.driverId ?? body.driver_id ?? null;
  const expenseTrailerId = loadAttribution ? loadAttribution.trailerId : body.trailer_id ?? null;

  // TEST-DATA-BANK-MATCH-EXPENSES-DOUBLE-SEEDED-6210: this route has no per-call idempotency key,
  // so a caller (script retry, or a UI double-click racing the "submitting" disable) that POSTs an
  // identical (operating_company_id, memo) body twice creates a second real GL-posting expense with
  // no error surfaced. Confirmed live on prod: 12 exact-duplicate pairs on account 6210, each pair's
  // two rows ~20-30s apart, same memo (`TEST DATA VOID-AT-LAUNCH bank match <uuid>`), same amount,
  // two different source_transaction_ids — $23,773.38 double-counted. memo is the closest thing to
  // an idempotency key this route has; a genuinely distinct expense re-using the exact same memo
  // text within 2 minutes for the same company is vanishingly rare next to the cost of a silent
  // duplicate posting, so a repeat is rejected rather than silently accepted.
  if (hasMemo && body.memo && body.memo.trim()) {
    const dup = await client.query(
      `SELECT id FROM accounting.expenses
        WHERE operating_company_id = $1::uuid
    AND memo = $2
    AND voided_at IS NULL
    AND created_at > now() - interval '2 minutes'
        LIMIT 1`,
      [body.operating_company_id, body.memo]
    );
    if (dup.rows[0]) {
      return {
        duplicateSubmission: true as const,
        existingExpenseId: String((dup.rows[0] as { id?: string }).id ?? ""),
      };
    }
  }

  // 443.110 G13 — an item named on the line must be this company's.
  if (body.item_id) {
    const itemRes = await client.query(
      `SELECT id FROM catalogs.items WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [body.item_id, body.operating_company_id]
    );
    if (!itemRes.rows[0]) return { itemNotInCompany: true as const };
  }

  if (body.vendor_uuid) {
    const vendorRes = await client.query(
      `SELECT id FROM mdata.vendors
       WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
       LIMIT 1`,
      [body.vendor_uuid, body.operating_company_id]
    );
    if (!vendorRes.rows[0]) return { vendorNotInCompany: true as const };
  }

  // ROUND 155.18 JOB 2 (owner order, 2026-09-28) — an expense's load_id must belong to the
  // SAME entity as the expense itself. This mirrors the vendor_uuid check immediately above
  // (same shape: entity-scoped SELECT, reject if the row is not visible under this company).
  // Before this check, the only load lookup on this path (the unit-mismatch resolver a few
  // lines below) scoped its own query by operating_company_id too, but treated "load not
  // found under this company" as "load has no assigned unit" (a silent null) rather than as
  // a cross-entity load_id — so a TRANSPORTATION-owned load_id passed straight through into
  // this USMCA expense's INSERT with no rejection at all. Live-verified this round: 0 of 528
  // live USMCA expenses currently carry a cross-entity load_id (the historical instances of
  // this defect were already voided/purged), but nothing in this route stopped a new one.
  if (body.load_id) {
    const loadEntityRes = await client.query(
      `SELECT id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [body.load_id, body.operating_company_id]
    );
    if (!loadEntityRes.rows[0]) return { loadNotInCompany: true as const };
  }

  // Resolve the form's QBO category account → a catalogs.accounts (GL) id, ENTITY-SCOPED
  // (operating_company_id) per TRK/TRANSP/USMCA independence. Reject if the QBO account isn't yet
  // bridged into this entity's ledger chart — surfaced as an honest CoA-gap, never silently
  // miscategorized (the CoA-completeness fill is a separate owner-gated step).
  let categoryAccountId: string | null = null;
  if (body.category_account_id) {
    const byId = await client.query(
      `SELECT id::text AS id
         FROM catalogs.accounts
        WHERE id = $1::uuid
    AND operating_company_id = $2::uuid
    AND deactivated_at IS NULL
        LIMIT 1`,
      [body.category_account_id, body.operating_company_id]
    );
    categoryAccountId = (byId.rows[0] as { id?: string } | undefined)?.id ?? null;
    if (!categoryAccountId) return { categoryUnbridged: true as const };
  } else if (body.category_qbo_id) {
    const catRes = await client.query(
      `SELECT id::text AS id
         FROM catalogs.accounts
        WHERE qbo_account_id = $1
    AND operating_company_id = $2::uuid
    AND deactivated_at IS NULL
        LIMIT 1`,
      [body.category_qbo_id, body.operating_company_id]
    );
    categoryAccountId = (catRes.rows[0] as { id?: string } | undefined)?.id ?? null;
    if (!categoryAccountId) return { categoryUnbridged: true as const };
  }

  // ACCT-LINK-04: resolve the expense CATEGORY against this entity's own catalog. An explicit id
  // that does not resolve is rejected rather than dropped — silently writing an uncategorized
  // line after the operator picked a category is the kind of quiet miscategorization the
  // category link exists to prevent.
  const expenseCategoryId = await resolveExpenseCategoryId(client, {
    operatingCompanyId: body.operating_company_id,
    categoryId: body.expense_category_id ?? null,
    categoryCode: body.expense_category_code ?? null,
    accountId: categoryAccountId,
  });
  if ((body.expense_category_id || body.expense_category_code) && !expenseCategoryId) {
    return { categoryNotInEntityCatalog: true as const };
  }

  // GO-19-1b G3 (owner 2026-09-03) — "fixed-cost categories (insurance, plates, the truck note)
  // may never carry a load_id." Rung 3: these are PERIOD costs on the UNIT, never trip costs;
  // forcing one onto a load makes trip margin meaningless. Checked by category CODE, not name
  // (catalogs.expense_categories.code is the stable identity; display_name is editable).
  if (expenseCategoryId && body.load_id) {
    const catCode = await client.query(
      `SELECT code FROM catalogs.expense_categories WHERE id = $1::uuid LIMIT 1`,
      [expenseCategoryId]
    );
    const code = String((catCode.rows[0] as { code?: string } | undefined)?.code ?? "").toUpperCase();
    if (FIXED_COST_CATEGORY_CODES.has(code)) {
      return { fixedCostCannotCarryLoadId: true as const, code };
    }
  }

  const columns: string[] = ["operating_company_id", "status", "transaction_date", "total_amount_cents"];
  const values: unknown[] = [body.operating_company_id, "posted", body.expense_date, body.amount_cents];

  // FAIL-F2 / ACCT-F262 — the expense writer could not record that an expense is TEST data.
  // `accounting.expenses.is_sample_data` exists and defaults false, and NOTHING ever wrote it, so
  // every expense the app created was permanently indistinguishable from real money. The GL then
  // inherits it: posting-engine reads the source row's flag (ACCT-F212), so an untagged expense
  // produces an untagged journal entry and sample spend lands in real books.
  //
  // The operators already told us, in the only field that would take it. Two expenses created
  // 2026-08-08 21:30 and 21:31 carry memos reading `USMCA_GATEB_SAMPLE_2026-08-08 … TEST data`
  // and `SAMPLE expense for banking match test` — both stored with is_sample_data=false. When
  // people type SAMPLE into a free-text memo, the structured flag is missing, not ignored.
  //
  // Optional and defaulting to false, deliberately: a caller that omits it keeps today's
  // behaviour exactly, so this cannot retroactively re-classify anything. Only an explicit
  // `true` marks sample.
  columns.push(`is_sample_data`);
  values.push(body.is_sample_data === true);

  // SET-14 (ROUND 16.26) — two independent flags per cost row: is_reimbursable (owed back
  // to the driver who fronted it) and is_company_expense (a direct company cost). Same
  // optional/default-false-on-omit treatment as is_sample_data above — a caller that omits
  // either keeps today's behaviour exactly (both false), never a silent re-classification.
  columns.push(`is_reimbursable`);
  values.push(body.is_reimbursable === true);
  columns.push(`is_company_expense`);
  values.push(body.is_company_expense === true);

  if (hasVendor) {
    columns.push(`vendor_uuid`);
    values.push(body.vendor_uuid ?? null);
  }

  if (driverColumn) {
    columns.push(driverColumn);
    values.push(expenseDriverId);
  }

  if (hasMemo) {
    columns.push(`memo`);
    values.push(body.memo ?? null);
  }

  if (hasPaymentAccount) {
    columns.push(`payment_account_uuid`);
    values.push(body.payment_account_uuid ?? null);
  }

  if (hasWorkOrderId) {
    columns.push(`linked_work_order_uuid`);
    values.push(body.work_order_id ?? null);
  }

  let headerUnitId: string | null = null;
  if (hasUnitId) {
    // GO-19-1b (owner 2026-09-03, re-scoped FORWARD GUARANTEE — no backfill, no touching the
    // frozen entities' 27,070 legacy rows): "unit_id MANDATORY on every new expense. An
    // expense with no truck cannot be costed." Rung 1 (direct trace) wins when the caller
    // already knows the truck; Rung 2 ("trace to the leg; the leg carries the truck") derives
    // it from mdata.loads.assigned_unit_id when the caller only sent load_id (e.g.
    // LoadDetailCostsTab's load-scoped cost entries never asked the operator to repick the
    // unit the load already carries). G1 (below) rejects only when NEITHER source resolves one.
    let resolvedUnitId = body.unit_id ?? null;
    if (body.load_id) {
      const loadUnit = await client.query(
        `SELECT assigned_unit_id::text AS assigned_unit_id
     FROM mdata.loads
    WHERE id = $1::uuid AND operating_company_id = $2::uuid
    LIMIT 1`,
        [body.load_id, body.operating_company_id]
      );
      const loadAssignedUnitId =
        (loadUnit.rows[0] as { assigned_unit_id?: string | null } | undefined)?.assigned_unit_id ?? null;
      // G2 — an expense may never carry a load_id whose load has a DIFFERENT unit_id. Only a
      // real mismatch (both non-null, different) is rejected; a load with no unit assigned yet
      // has nothing to conflict with, so an explicit unit_id still stands.
      if (resolvedUnitId && loadAssignedUnitId && resolvedUnitId !== loadAssignedUnitId) {
        return { unitLoadMismatch: true as const, unitId: resolvedUnitId, loadUnitId: loadAssignedUnitId };
      }
      if (!resolvedUnitId) resolvedUnitId = loadAssignedUnitId;
    }
    if (!resolvedUnitId) {
      return { unitIdRequired: true as const };
    }
    columns.push(`unit_id`);
    values.push(resolvedUnitId);
    headerUnitId = resolvedUnitId;
  }

  if (hasTrailerId) {
    columns.push(`trailer_id`);
    values.push(expenseTrailerId);
  }
  if (loadAttribution?.nonOwnedTrailerId && (await columnExists(client, "accounting", "expenses", "non_owned_trailer_id"))) {
    columns.push(`non_owned_trailer_id`);
    values.push(loadAttribution.nonOwnedTrailerId);
  }

  const hasInsuranceClaimId = await columnExists(client, "accounting", "expenses", "insurance_claim_id");
  if (hasInsuranceClaimId) {
    columns.push(`insurance_claim_id`);
    values.push(body.insurance_claim_id ?? null);
  }

  // ACCT-F5629 — same column-gated treatment as insurance_claim_id above; see migration
  // 202612821300 and listLegalMatterLinkedCosts (bills.service.ts) for the reverse-drill half.
  const hasLegalMatterId = await columnExists(client, "accounting", "expenses", "legal_matter_id");
  if (hasLegalMatterId) {
    columns.push(`legal_matter_id`);
    values.push(body.legal_matter_id ?? null);
  }

  // GO-19-09 — same column-gated treatment as legal_matter_id above; see migration
  // 202613370001. Mirrors accounting.bills.class_id (header-only QBO Class dimension).
  const hasClassId = await columnExists(client, "accounting", "expenses", "class_id");
  if (hasClassId) {
    columns.push(`class_id`);
    values.push(body.class_id ?? null);
  }

  // GO-09 L2 — vendor_document_number is NEVER minted (blank stays blank); duplicate
  // detection is per (operating_company_id, vendor_uuid), mirroring accounting.bills'
  // uq_bills_tms_native_vendor_bill_number exactly (two DIFFERENT vendors may reuse the same
  // number; the SAME vendor reusing it is very likely a double-entry). Sentinel-return
  // pattern (not reply.send here) matches the memo-duplicate check above -- this callback's
  // return value is inspected AFTER withCompanyScope resolves, not replied to from inside it.
  const hasVendorDocumentNumber = await columnExists(client, "accounting", "expenses", "vendor_document_number");
  const operatorVendorDocumentNumber = body.vendor_document_number?.trim() || null;
  if (hasVendorDocumentNumber && operatorVendorDocumentNumber && hasVendor && body.vendor_uuid) {
    const dupVendorDoc = await client.query(
      `
        SELECT id::text FROM accounting.expenses
        WHERE operating_company_id = $1::uuid
    AND vendor_uuid = $2::uuid
    AND vendor_document_number = $3
    AND voided_at IS NULL
        LIMIT 1
      `,
      [body.operating_company_id, body.vendor_uuid, operatorVendorDocumentNumber]
    );
    if (dupVendorDoc.rows[0]) {
      return {
        duplicateVendorDocumentNumber: true as const,
        vendorDocumentNumber: operatorVendorDocumentNumber,
        existingExpenseId: String((dupVendorDoc.rows[0] as { id?: string }).id ?? ""),
      };
    }
  }
  if (hasVendorDocumentNumber) {
    columns.push(`vendor_document_number`);
    values.push(operatorVendorDocumentNumber);
  }

  // ACT-F5413 (LV-EXPENSES-UNAUDITED-AND-ACTORLESS, actor half): the audit-trigger half of this
  // finding was already fixed under ACCT-F261 (append-only audit.audit_events row on every
  // insert), but created_by_user_id itself — the row's own actor-of-record column — was never
  // written on this TMS-native create path even though the authed user is already in scope.
  const hasCreatedByUserId = await columnExists(client, "accounting", "expenses", "created_by_user_id");
  if (hasCreatedByUserId) {
    columns.push(`created_by_user_id`);
    values.push(userId);
  }

  const operatorExpenseNumber = body.expense_number?.trim() || null;
  if (hasExpenseNumber && operatorExpenseNumber) {
    columns.push(`expense_number`);
    values.push(operatorExpenseNumber);
  }

  // Explicit load_id from caller — do not silently drop (WAVE-H2 CLS-LINKAGE-ONEWAY).
  if (hasLoadId && body.load_id) {
    columns.push(`load_id`);
    values.push(body.load_id);
  }

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const insertSql = `
    INSERT INTO accounting.expenses (${columns.join(", ")})
    VALUES (${placeholders})
    RETURNING id
  `;

  const inserted = await client.query(insertSql, values);
  const expenseId = String((inserted.rows[0] as { id?: string } | undefined)?.id ?? "");
  if (!expenseId) throw new Error("expense_insert_failed");

  // Option B: link create-time draft receipts to the real expense id, atomically with the insert.
  await reassignDraftAttachments(client, {
    operatingCompanyId: body.operating_company_id,
    entityType: "expense",
    draftId: body.attachment_draft_id,
    newId: expenseId,
  });

  // Load attribution is driver-centric — skip when caller already stamped load_id (WAVE-H2). Read-only; resolved
  // BEFORE the line insert (443.105) so the line carries the same load the header is stamped with below.
  const attribution =
    !body.load_id && body.driver_id
      ? await attributeExpenseToLoad(client, {
    driverId: body.driver_id,
    operatingCompanyId: body.operating_company_id,
    expenseTimestamp: new Date(`${body.expense_date}T12:00:00.000Z`),
    expenseLocation:
      body.location_lat != null && body.location_lng != null
        ? { lat: body.location_lat, lng: body.location_lng }
        : undefined,
        })
      : null;

  // Categorized line carrying the resolved GL account, so the posting engine debits the real
  // category (not "Uncategorized"). One line = the full amount on the integer-cents spine.
  if (categoryAccountId && (await relationExists(client, "accounting.expense_lines"))) {
    // amount_cents = the integer-cents spine; the legacy numeric `amount` column mirrors it in
    // dollars (same idiom as the /post synthesizer). Cents stays authoritative.
    const cents = body.amount_cents;
    const lineColumns = ["expense_id", "line_sequence", "amount_cents", "amount", "description", "expense_account_uuid"];
    const lineValues: unknown[] = [expenseId, 1, cents, cents / 100, body.memo ?? "Expense", categoryAccountId];

    // Column-gated so a DB that predates migration 0050 still writes the line.
    if (expenseCategoryId && (await columnExists(client, "accounting", "expense_lines", "expense_category_uuid"))) {
      lineColumns.push("expense_category_uuid");
      lineValues.push(expenseCategoryId);
    }

    // LV-G18-INERT-ON-EXPENSE-LINES: line_category was never written by this create path, so
    // accounting.enforce_load_fk_invariant()'s `IF NEW.line_category IS NOT NULL` branch never
    // ran and the G18 load-linkage invariant stayed dormant for 0 of 34,001 rows (board finding
    // 2026-08-16). Derived here — NOT invented — from the operator's own already-chosen
    // expense_category_uuid, lowercase-matched against the canonical
    // accounting.line_category_load_required set (diesel/def/toll/scale/lumper/parking/
    // roadside_repair/detention_paid/over_road_other). A category with no exact match (the
    // large majority — repairs, insurance, permits, etc.) stays NULL, unchanged from today.
    // Deliberately paired with load_id + load_exemption_reason below in the SAME insert — the
    // withheld half of this fix was writing line_category ALONE, which would have turned a
    // silently-succeeding no-load diesel/toll/lumper expense into a raw trigger exception with
    // no escape hatch. RecordExpenseForm.tsx now requires a load OR a >=20-char reason before
    // submit for these 9 categories, so this insert always carries one or the other for them.
    let lineCategory: string | null = null;
    if (expenseCategoryId && (await relationExists(client, "accounting.line_category_load_required"))) {
      const categoryRow = await client.query(
        `SELECT r.line_category
     FROM catalogs.expense_categories ec
     JOIN accounting.line_category_load_required r ON r.line_category = lower(ec.code)
    WHERE ec.id = $1::uuid`,
        [expenseCategoryId]
      );
      lineCategory = (categoryRow.rows[0] as { line_category?: string } | undefined)?.line_category ?? null;
    }
    if (lineCategory && (await columnExists(client, "accounting", "expense_lines", "line_category"))) {
      lineColumns.push("line_category");
      lineValues.push(lineCategory);
    }
    // 443.105 #2 — EVERY line carries its load (the caller's, else the driver-attributed one the header gets) or an
    // explicit reason. A G18 load-required category is never auto-exempted: with neither, the DB trigger refuses it.
    const lineLoadId = body.load_id ?? attribution?.loadId ?? null;
    if (await columnExists(client, "accounting", "expense_lines", "load_id")) {
      lineColumns.push("load_id");
      lineValues.push(lineLoadId);
    }
    if (await columnExists(client, "accounting", "expense_lines", "load_exemption_reason")) {
      const accountLabel = lineLoadId
        ? null
        : (
            (
              await client.query(
                `SELECT NULLIF(concat_ws(' ', a.account_number, a.account_name), '') AS label FROM catalogs.accounts a WHERE a.id = $1::uuid`,
                [categoryAccountId]
              )
            ).rows[0] as { label?: string | null } | undefined
          )?.label ?? null;
      lineColumns.push("load_exemption_reason");
      lineValues.push(
        resolveLineLoadExemption({
          loadId: lineLoadId,
          reason: body.load_exemption_reason ?? null,
          loadRequired: Boolean(lineCategory),
          accountLabel,
          context: `expense ${body.expense_date}`,
        })
      );
    }

    // 443.110 G13 — the line names its item with the source quantity / unit / rate (1 x amount 'each' when the caller
    // gave none), and carries the header's driver / unit / trailer (RULING 443.66 D5: every line carries them).
    if (body.item_id && (await columnExists(client, "accounting", "expense_lines", "item_id"))) {
      const qty = body.quantity ?? 1;
      lineColumns.push("item_id", "quantity", "rate_cents", "unit_of_measure");
      lineValues.push(body.item_id, qty, body.rate_cents ?? (qty === 1 ? cents : null), body.unit_of_measure?.trim() || "each");
    }
    for (const [col, val] of [["driver_id", expenseDriverId], ["unit_id", headerUnitId], ["trailer_id", expenseTrailerId]] as const) {
      if (val && (await columnExists(client, "accounting", "expense_lines", col))) {
        lineColumns.push(col);
        lineValues.push(val);
      }
    }

    await client.query(
      `INSERT INTO accounting.expense_lines (${lineColumns.join(", ")})
       VALUES (${lineColumns.map((_, i) => `$${i + 1}`).join(", ")})`,
      lineValues
    );
  }


  let expenseNumber: string | null = operatorExpenseNumber;

  if (attribution) {
    const numbered = await generateExpenseNumber(client, attribution.loadId, body.operating_company_id);
    const headerNumber = expenseNumber ?? numbered.number;

    await insertExpenseLoadLink(client, {
      operatingCompanyId: body.operating_company_id,
      expenseId,
      loadId: attribution.loadId,
      loadNumber: numbered.loadNumber,
      seq: numbered.seq,
      expenseNumber: headerNumber,
      method: attribution.method,
      confidence: attribution.confidence,
      reason: attribution.reason,
      userId,
    });

    expenseNumber = headerNumber;

    if (hasExpenseNumber) {
      await client.query(`UPDATE accounting.expenses SET expense_number = $2 WHERE id = $1`, [expenseId, headerNumber]);
    }
    if (hasLoadId) {
      await client.query(`UPDATE accounting.expenses SET load_id = $2 WHERE id = $1`, [expenseId, attribution.loadId]);
    }

    await emitOutbox(client, "expense.created.attributed", {
      expense_id: expenseId,
      operating_company_id: body.operating_company_id,
      load_id: attribution.loadId,
      expense_number: headerNumber,
    });

    await appendCrudAudit(client, userId, "expense.created", { expense_id: expenseId, attributed: true }, "info", "P6-T11176");
  } else if (body.load_id) {
    // Explicit load stamped on INSERT — no attribution ALERT, but the expense IS attributed to
    // a load, so it is a `.attributed` event. It previously emitted bare "expense.created",
    // which has no registered handler and therefore FAILED in the outbox on every explicit-load
    // expense (2 such failures on prod 2026-08-03). `explicit_load` in the payload preserves the
    // distinction between auto-attributed and hand-stamped.
    //
    // LV-EXPENSE-NUMBER-NEVER-POPULATED: this branch said the expense IS attributed and then
    // skipped everything that RECORDS the attribution — no expense number, no link row. The
    // auto-attribution branch above did all three. Two writers for one concept, one incomplete:
    // 9 of 22 USMCA expenses carried a load_id with 0 expense_number, and
    // expense_attribution.expense_load_links was 0 rows database-wide.
    // expense_number is a LOAD-SCOPED sequence (L-<load>-Exx), not a QBO-style document series,
    // so it is generated HERE from the same generator rather than invented as a second series,
    // and historical rows are NOT backfilled — a number implies an attribution event that never
    // happened for them.
    const numbered = await generateExpenseNumber(client, body.load_id, body.operating_company_id);
    const headerNumber = expenseNumber ?? numbered.number;
    // ACCT-F5044 — CHECK on expense_load_links only allows
    // attribution_method IN (auto_timestamp|auto_location|manual_override|user_assigned)
    // and attribution_confidence IN (high|medium|low). The prior literals
    // 'explicit_load' + numeric 1 failed the CHECK, aborted the txn after
    // expenses.load_id was staged, and left load-linked TMS expenses with
    // expense_number NULL + zero expense_load_links rows (9 on USMCA).
    await insertExpenseLoadLink(client, {
      operatingCompanyId: body.operating_company_id,
      expenseId,
      loadId: body.load_id,
      loadNumber: numbered.loadNumber,
      seq: numbered.seq,
      expenseNumber: headerNumber,
      method: "user_assigned",
      confidence: "high",
      reason: "Load stamped explicitly by the operator on expense create",
      userId,
    });
    expenseNumber = headerNumber;
    if (hasExpenseNumber) {
      await client.query(`UPDATE accounting.expenses SET expense_number = $2 WHERE id = $1`, [expenseId, headerNumber]);
    }

    await emitOutbox(client, "expense.created.attributed", {
      expense_id: expenseId,
      operating_company_id: body.operating_company_id,
      load_id: body.load_id,
      explicit_load: true,
      expense_number: headerNumber,
      category_account_id: categoryAccountId,
    });
    await appendCrudAudit(
      client,
      userId,
      "expense.created",
      { expense_id: expenseId, load_id: body.load_id, explicit_load: true },
      "info",
      "P6-T11176"
    );
  } else if (body.driver_id) {
    await insertUnattributedAlert(client, body.operating_company_id, expenseId);
    await emitOutbox(client, "expense.created.unattributed", {
      expense_id: expenseId,
      operating_company_id: body.operating_company_id,
      driver_id: body.driver_id,
    });
    await appendCrudAudit(client, userId, "expense.created", { expense_id: expenseId, attributed: false }, "warning", "P6-T11176");
  } else {
    // Driverless general expense — categorized cash-out, no load attribution expected (not an
    // alert). Still `.unattributed`: no load is linked. It previously emitted bare
    // "expense.created", which has no registered handler and failed in the outbox. `driverless`
    // in the payload keeps this distinguishable from a driver expense missing its load.
    await emitOutbox(client, "expense.created.unattributed", {
      expense_id: expenseId,
      operating_company_id: body.operating_company_id,
      driverless: true,
      category_account_id: categoryAccountId,
    });
    await appendCrudAudit(client, userId, "expense.created", { expense_id: expenseId, driverless: true, category_account_id: categoryAccountId }, "info", "P6-T11176");
  }

  if (hasExpenseNumber && !expenseNumber) {
    expenseNumber = await nextExpenseDisplayId(client, body.operating_company_id, new Date(`${body.expense_date}T00:00:00.000Z`));
    await client.query(`UPDATE accounting.expenses SET expense_number = $2 WHERE id = $1`, [expenseId, expenseNumber]);
  }

  // ACCOUNTING-SPINE-EVENT-FIRE-AND-FORGET-SILENT-DROP: this used to fire in a SEPARATE
  // withCompanyScope transaction opened AFTER this one had already committed, with a bare
  // .catch(warn) — a real emit failure was silently swallowed (the expense exists, the audit
  // trail doesn't). Moved into the expense's own creation transaction, awaited, so the write
  // and its spine event can never diverge. By this point every early-return validation branch
  // (schema-missing/category-unbridged/vendor-mismatch/duplicate) has already exited above, so
  // reaching here means the expense row is real.
  await emitAccountingSpineEvent(client, {
    operating_company_id: body.operating_company_id,
    actor_user_id: String(userId),
    event_type: "expense.created",
    entity_id: expenseId,
    entity_type: "expense",
    source_table: "accounting.expenses",
  });

  // OWNER LAW 2026-10-01 ("an expense/invoice created in the app must always post to the correct accounts"):
  // post INSIDE the creation transaction. With the entity's EXPENSE_GL_POSTING flag ON (USMCA: ON), a poster
  // failure throws and the whole create rolls back — no expense row can exist unposted because the poster
  // refused it. Same mechanism as the invoice send path (#23827). Flag OFF keeps the legacy unposted create.
  let postedJournalEntryId: string | null = null;
  if (categoryAccountId && body.payment_account_uuid) {
    const flagOnInTx = await isEnabled(client, EXPENSE_GL_POSTING_FLAG_KEY, { operating_company_id: body.operating_company_id, user_uuid: String(userId) });
    if (flagOnInTx) {
      try {
        const posting = await postSourceTransactionInClientTx(
    client,
    { operating_company_id: body.operating_company_id, source_transaction_type: "expense", source_transaction_id: expenseId },
    { userId: String(userId) }
        );
        postedJournalEntryId = posting.journal_entry_id;
        await client.query(
    `UPDATE accounting.expenses
        SET status='posted', posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, updated_at=now()
      WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
    [expenseId, postedJournalEntryId, body.operating_company_id]
        );
        await appendCrudAudit(client, userId, "expense.posted", { expense_id: expenseId, journal_entry_id: postedJournalEntryId, source: "record_expense_create_in_tx" }, "info", "ACCT-F9602");
      } catch (err) {
        if (err instanceof PostingEngineError) throw new ExpensePostRefused(err.code, err.message);
        throw err;
      }
    }
  }

  return {
    expense_id: expenseId,
    expense_number: expenseNumber,
    category_account_id: categoryAccountId,
    has_payment_account: Boolean(body.payment_account_uuid),
    posted_journal_entry_id: postedJournalEntryId,
  };
}

export type CreateExpenseBody = import("zod").infer<typeof createExpenseBodySchema>;

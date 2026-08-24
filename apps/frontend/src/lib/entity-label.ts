/**
 * CLS-UUID-LABEL — render a human label for a record, never a uuid prefix.
 *
 * The pattern this replaces is `name ?? id.slice(0, 8)`: a real display name with a TRUNCATED UUID as
 * the fallback. That fallback is worse than showing nothing. Eight hex characters identify nothing to
 * an operator, they are not searchable, two different records can look alike at a glance, and — worst —
 * the screen looks like it is working. A dispatcher reading "a3f91c2b…" cannot tell whether the name is
 * missing, the join failed, or the record belongs to another entity.
 *
 * So the fallback here is a SENTENCE, not an identifier:
 *   · a name            → the name
 *   · an id, no name    → "Driver — not visible"   (the row exists; this session cannot resolve it,
 *                                                    which usually means an entity-scoped join found
 *                                                    nothing — a real signal, deliberately not disguised)
 *   · neither           → "Unassigned"
 *
 * A uuid-shaped "name" (including when a list API falls back to `vendor_name: vendor_id`) is NOT a
 * name — treat it as missing so the Bills Vendor column cannot paint a raw UUID as if it resolved.
 *
 * ACCT-F6284 — a serialized-JSON "name" is the same class of not-a-name. `accounting.bill_payments`
 * (and `accounting.bills`) rows created by the bank-transaction-split flow write internal audit
 * metadata straight into their `memo` column (`JSON.stringify({source:"bank_tx_split", ...})`) —
 * that column is ALSO the exact fallback the Accounting hub's "Find Transactions" panel reads for its
 * display label (reference_number → check_number → memo), so a real, live row rendered as literal
 * `{"source":"bank_tx_split","bank_transaction_id":"f9cc15bf-...","split_line_no":2}` in the UI. The
 * write-side fix (don't store internal metadata in a human-facing memo column) is money-ledger schema
 * work outside this lane; this is the general-class guard so ANY current or future caller of
 * entityLabel that gets handed a JSON-poisoned "name" — not just this one dashboard panel — falls
 * back to the same honest sentence instead of dumping raw JSON at an operator.
 *
 * `noun` should name the thing, so the fallback reads as English. Callers that genuinely have nothing
 * better can omit it and get "Record".
 */
const UUID_SHAPE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ACCT-F6284: a string that parses as a JSON object/array is internal data, never a display name.
 * Exported so free-text display sites (a "Memo" column, not an entity-name lookup) can reuse the
 * same detection without adopting entityLabel's "not visible" resolved-entity semantics — see
 * TransfersListPage.tsx, whose Memo column/detail can inherit a serialized-JSON categorization_memo
 * from apps/backend/src/banking/bulk-transactions.ts when a bulk-categorized bank feed line is later
 * minted into a bank-to-bank transfer (apps/backend/src/banking/transfers.service.ts,
 * mintTransferForBankFeedLineInClient: `categorization_memo?.trim() || description?.trim()`).
 */
export function looksLikeSerializedJson(s: string): boolean {
  const first = s[0];
  if (first !== "{" && first !== "[") return false;
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

export function entityLabel(
  name: unknown,
  id?: unknown,
  noun = "Record",
): string {
  if (name != null) {
    const s = String(name).trim();
    if (s !== "" && !UUID_SHAPE_RE.test(s) && !looksLikeSerializedJson(s)) return s;
  }
  if (id != null && String(id).trim() !== "") return `${noun} — not visible`;
  return "Unassigned";
}

/**
 * Visible list/register/audit row: never claim the document is "not visible" while showing it.
 * UUID-shaped or Unknown names are missing document numbers, not RLS tombstones.
 */
export function visibleDocumentLabel(
  name: unknown,
  _id?: unknown,
  noun = "Record",
): string {
  if (name != null) {
    const s = String(name).trim();
    if (s !== "" && !UUID_SHAPE_RE.test(s) && !/^unknown\b/i.test(s) && !looksLikeSerializedJson(s)) return s;
  }
  return noun;
}

/**
 * LV-REPORTS-*-DEAD-CUSTOMER-TOMBSTONE-LINK — unresolved / unknown buckets must not
 * mount EntityLink (dead drill → Failed to load customer details).
 * Covers: entityLabel "— not visible", raw "Unknown …" cohort labels, UUID-shaped names.
 */
export function isUnresolvedEntityTombstone(
  name: unknown,
  id: unknown,
  noun: string,
): boolean {
  const display = entityLabel(name, id, noun);
  if (display === `${noun} — not visible`) return true;
  const raw = name != null ? String(name).trim() : "";
  if (/^unknown\b/i.test(raw)) return true;
  return false;
}

/**
 * Infer a display noun from an id field name, so generated call sites read naturally:
 * `load_uuid` → "Load", `assigned_primary_driver_id` → "Driver", `vendor_id` → "Vendor".
 * Exported for the codemod and its tests; hand-written call sites should just pass the noun.
 */
export function nounFromIdField(field: string): string {
  const base = field
    .replace(/^.*\./, "")
    .replace(/_?(uuid|id)$/i, "")
    .replace(/^(assigned|primary|current|new|previous|co)_/, "")
    .replace(/_/g, " ")
    .trim();
  if (!base) return "Record";
  const last = base.split(" ").filter(Boolean).pop() ?? base;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

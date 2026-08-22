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
 * `noun` should name the thing, so the fallback reads as English. Callers that genuinely have nothing
 * better can omit it and get "Record".
 */
const UUID_SHAPE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function entityLabel(
  name: unknown,
  id?: unknown,
  noun = "Record",
): string {
  if (name != null) {
    const s = String(name).trim();
    if (s !== "" && !UUID_SHAPE_RE.test(s)) return s;
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
    if (s !== "" && !UUID_SHAPE_RE.test(s) && !/^unknown\b/i.test(s)) return s;
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

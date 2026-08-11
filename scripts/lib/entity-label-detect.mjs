/**
 * CLS-GUARD-LITERAL-DETECTION — shared detector for "this EntityLink shows a human label, not a uuid".
 *
 * THE PROBLEM THIS EXISTS TO END. Several guards assert the label-resolution control by grepping the
 * INLINE spelling it originally shipped as:
 *
 *     label={row.unit_number?.trim() || "Unit"}
 *     label={(row.driver_name as string | undefined)?.trim() || "Driver"}
 *
 * When those call sites moved behind the shared helper `entityLabel(name, id, noun)` —
 *
 *     label={entityLabel(row.unit_number, row.unit_id, "Unit")}
 *
 * — three guards went RED on pages that had become STRICTLY SAFER, and the only way to green them was
 * to un-harden the page back to the inline form. A guard that punishes the fix teaches the next agent
 * to revert the control, which is worse than having no guard at all. Same failure mode already on the
 * board for the GUC class (scripts/lib/tenant-context-detect.mjs) and the rate-limit literal.
 *
 * WHY ACCEPTING THE HELPER SPELLING DOES NOT WEAKEN THE ASSERTION. `entityLabel` is not a synonym for
 * the inline expression — it is a superset, and it is itself guarded
 * (`verify-entity-label-rejects-uuid-shaped-name.mjs`, live 0 / selftest 0 as of 2026-08-11):
 *
 *   • returns the trimmed name only when it is non-empty AND NOT uuid-shaped — the inline `|| "Unit"`
 *     form happily renders a uuid that arrived in the NAME column, which is the very defect
 *     LV-TXN-002 is about;
 *   • otherwise, when an id exists, returns `"<noun> — not visible"` — a word, never the raw id;
 *   • otherwise returns "Unassigned".
 *
 * So the accepted SPELLING widens while the assertion narrows. What is still rejected: a label that
 * falls back to the id field, to `undefined`, or that names no noun at all.
 *
 * NOT CLAIMED: this is static text analysis of a JSX attribute. It proves the call site asks for a
 * resolved label; it does not prove the API supplied a name for any particular row.
 */

/** `entityLabel(<name expr>, <id expr>, "<Noun>")` — the shared helper, noun-bearing. */
function helperSpelling(field, noun) {
  return new RegExp(
    String.raw`entityLabel\s*\(\s*\(?\s*row\.${field}\b[\s\S]{0,160}?["']${noun}["']\s*\)`,
    "i",
  );
}

/** Legacy inline `row.<field>…?.trim() || "<Noun>"` (also tolerates `??`). */
function inlineSpelling(field, noun) {
  return new RegExp(
    String.raw`row\.${field}\b[\s\S]{0,80}?(?:\|\||\?\?)\s*["']${noun}["']`,
    "i",
  );
}

/**
 * Every `label={…}` attribute in `src`, as raw expression text.
 *
 * ★ WHY THE ASSERTION IS SLICED TO THE ATTRIBUTE AND NOT RUN FILE-WIDE (caught by mutation while
 * building this helper, 2026-08-11 — the first version WAS file-wide and it let a mutation through).
 * A page that renders a unit column typically also carries the string "Unit" as a column HEADER and
 * mentions `row.unit_number` in a filter or an export map. Run file-wide, `labelResolves` matched that
 * incidental pairing, so replacing the real label with a bare `label={row.unit_id}` still "resolved".
 * That is exactly the file-wide-`.test()` false green this whole class exists to stamp out — it would
 * have shipped a guard that cannot see the defect it names. Slicing to the attribute means the label a
 * dispatcher actually reads has to carry the resolution itself.
 */
function labelExpressions(src) {
  const out = [];
  const re = /label=\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    // Walk braces from the opening `{` so nested calls/objects inside the expression stay intact.
    let depth = 0;
    let i = m.index + "label=".length;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(start, i + 1));
  }
  return out;
}

/**
 * The label for `row.<field>` resolves to a human word — in EITHER the shared-helper spelling or the
 * legacy inline one. `noun` is the word a reader sees when no name is available ("Driver", "Unit", …).
 *
 * Only the `label={…}` attribute that references `<field>` is considered, so an unrelated column header
 * carrying the same noun cannot satisfy the check (see labelExpressions).
 */
export function labelResolves(src, { field, noun }) {
  const fieldRe = new RegExp(String.raw`row\.${field}\b`);
  const candidates = labelExpressions(src).filter((expr) => fieldRe.test(expr));
  if (candidates.length === 0) return false;
  return candidates.some(
    (expr) => helperSpelling(field, noun).test(expr) || inlineSpelling(field, noun).test(expr),
  );
}

/**
 * The label falls back to something that renders as a uuid or a blank — the shapes that put an opaque
 * id in front of a dispatcher. Kept SEPARATE from labelResolves so a guard can report the specific
 * regression rather than a generic "no label".
 */
export function labelFallsBackToId(src, { field, idField }) {
  const toId = new RegExp(String.raw`label=\{\s*row\.${field}\s*(?:\?\?|\|\|)\s*row\.${idField}\b`, "i");
  const toUndefined = new RegExp(
    String.raw`row\.${field}\b[^}]{0,80}?(?:\?\?|\|\|)\s*undefined`,
    "i",
  );
  return toId.test(src) || toUndefined.test(src);
}

/**
 * A JSX prop is bound to a given identifier, tolerating the null-coalescing / default spellings that
 * accumulate around it: `prop={expr}`, `prop={expr ?? ""}`, `prop={expr || ""}`, `prop={expr!}`.
 *
 * SAME CLASS, DIFFERENT PROP (2026-08-11). `verify-drivers-team-create-picker` required the literal
 * `operatingCompanyId={selectedCompanyId}`; Drivers.tsx now reads `operatingCompanyId={selectedCompanyId ?? ""}`
 * — a type-safety improvement — and the guard reddened. Its selftest kept PASSING because the fixture
 * it tests against still used the bare literal, so the guard was green against a fiction and red
 * against reality: a selftest that does not read the real file cannot tell you the detector still works.
 *
 * The assertion is unchanged — the scope prop must be bound to the caller's selected company, not
 * omitted and not hardcoded. Only the accepted spelling widens.
 */
export function propBoundTo(src, { prop, identifier }) {
  const re = new RegExp(
    String.raw`\b${prop}\s*=\s*\{\s*${identifier}\b\s*(?:!|(?:\?\?|\|\|)\s*(?:""|''|` + "``" + String.raw`|null|undefined))?\s*\}`,
  );
  return re.test(src);
}

/** Both spellings, for guards that want to report which one a file uses. */
export const SPELLINGS = { helperSpelling, inlineSpelling };

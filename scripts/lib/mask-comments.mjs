/**
 * Offset-preserving comment masking for source-scanning guards.
 *
 * WHY: four guards in this repo match patterns against RAW source and therefore read prose as code.
 * Observed, all live:
 *   · verify-company-membership-assert  — counted `set_config('app.operating_company_id'…)` written in
 *     an explanatory comment as a SECOND tenant-GUC site ("1 assert < 2 GUC sets" on a file with one).
 *   · verify-sql-read-targets           — reported `au.uuid — column does not exist` AFTER the join was
 *     corrected to `au.id`, matching the pre-rename name mentioned in the comment above it.
 *   · verify-no-uuid-label-rendering    — flagged a NEW truncated-uuid label from the comment that
 *     DOCUMENTED removing `String(previous_driver_id).slice(0, 8)`.
 *   · verify-scoped-company-context-asserts-first — passed with its assert deleted, because it matched
 *     `assertCompanyMembership(` inside its own JSDoc.
 * Two directions, both dangerous: prose causes a FALSE FAILURE, and prose can SATISFY a check that the
 * real code no longer satisfies. It also perversely punishes documenting a fix.
 *
 * WHY MASK RATHER THAN STRIP: these guards depend on markers that deliberately live in comments —
 * `membership-scope-exempt:`, `invite-entity-gate-exempt:`. Deleting comment text would destroy every
 * exemption in the repo. Masking replaces comment characters with spaces, so:
 *   · every byte offset and line/column number is unchanged (guards report positions and compare
 *     "GUC set #1 occurs before assert #1" — those comparisons must stay valid),
 *   · marker detection can still run against the RAW source.
 *
 * WHY A SCANNER RATHER THAN A REGEX: `//` inside a string or a SQL template literal is not a comment.
 * A naive regex would blank the remainder of a line containing "https://…" — and worse, could blank a
 * real `set_config(...)` that follows a URL inside a template literal, turning a true finding into a
 * silent pass. This tracks quote state ('  "  `) with escape handling, so only genuine JS comments are
 * masked. SQL `--` comments inside template literals are NOT masked: they are string content, and the
 * guards intentionally read SQL out of those literals.
 */

/** @returns {string} same length as `src`, with JS comment bodies replaced by spaces (newlines kept). */
export function maskComments(src) {
  const out = Array.from(src);
  let i = 0;
  const n = src.length;
  let quote = null; // "'", '"', or "`"
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      if (c === "\\") { i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { quote = c; i++; continue; }
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") { out[i] = " "; i++; }
      continue;
    }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let k = i; k < stop; k++) if (out[k] !== "\n") out[k] = " ";
      i = stop;
      continue;
    }
    i++;
  }
  return out.join("");
}

export default maskComments;

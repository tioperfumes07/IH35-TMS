/**
 * GUARD INFRASTRUCTURE: literal-or-const matcher.
 *
 * A DATA guard triggers on the code that produces data. When the codebase
 * replaces a raw literal with a named constant or design token, a guard that
 * still checks for the raw literal will false-fail — it reads the SOURCE TEXT
 * (which has ${CONST}) not the runtime value. This helper accepts EITHER form
 * so a guard stays correct through the refactor.
 *
 * Usage:
 *   import { literalOrConst, literalOrConstRegex } from "./lib/literal-or-const.mjs";
 *
 *   // .includes() style:
 *   if (!literalOrConst(src, "closed", "CLOSED_LOAD_STATUS")) failures.push("...");
 *
 *   // regex style (builds a pattern that matches either form):
 *   const re = literalOrConstRegex("l\\.status\\s*<>\\s*'closed'", "CLOSED_LOAD_STATUS", "'");
 *   if (!re.test(src)) failures.push("...");
 *
 *   // Or use the inner alternation in your own regex:
 *   // (?:closed|\$\{CLOSED_LOAD_STATUS\})
 *
 * Non-negotiable: this helper does NOT weaken any assertion. It accepts the
 * named constant as an EQUIVALENT form of the same value — it does not accept
 * a different value, does not skip the check, and does not make it report-only.
 * Every converted guard's selftest must still FAIL when the real thing is
 * removed.
 */

/**
 * Returns true if `src` contains either the raw `literal` value or the
 * `${constName}` interpolation of the same value.
 *
 * @param {string} src - the source text to check
 * @param {string} literal - the raw literal value (e.g. "closed")
 * @param {string} constName - the exported constant name (e.g. "CLOSED_LOAD_STATUS")
 * @returns {boolean}
 */
export function literalOrConst(src, literal, constName) {
  return src.includes(literal) || src.includes("${" + constName + "}");
}

/**
 * Builds a regex source fragment that matches either the raw literal or the
 * ${constName} interpolation. Use this inside a larger regex pattern.
 *
 * Example:
 *   const frag = literalOrConstFragment("closed", "CLOSED_LOAD_STATUS");
 *   // frag = "(?:closed|\\$\\{CLOSED_LOAD_STATUS\\})"
 *   const re = new RegExp("l\\.status\\s*<>\\s*'" + frag + "'");
 *
 * @param {string} literal - the raw literal value
 * @param {string} constName - the exported constant name
 * @returns {string} regex source fragment (not a RegExp — compose into your own)
 */
export function literalOrConstFragment(literal, constName) {
  const escLit = literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escConst = constName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return "(?:" + escLit + "|\\$\\{" + escConst + "\\})";
}

/**
 * Builds a complete RegExp that matches either the raw literal or the
 * ${constName} interpolation, wrapped in the given quote character.
 *
 * @param {string} literal - the raw literal value
 * @param {string} constName - the exported constant name
 * @param {string} [quote="'"] - the quote character around the value
 * @param {string} [flags] - regex flags
 * @returns {RegExp}
 */
export function literalOrConstRegex(literal, constName, quote = "'", flags) {
  const escQuote = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const frag = literalOrConstFragment(literal, constName);
  return new RegExp(escQuote + frag + escQuote, flags);
}

/**
 * Syntax-aware brace balancing for source-scanning guards.
 *
 * WHY: a naive `for (const ch of body) if (ch==="{") depth++; else if (ch==="}") depth--;` counts every
 * brace CHARACTER regardless of whether it appears in real code or inside a string/template/regex
 * literal. verify-selftests-can-fail.mjs's selftestBody() used exactly that scan and truncated
 * verify-matrix-banking-module-alias-recognized.mjs's selftest() body early: the fixture string
 * `.replace(/const LEDGER_MODULE_ALIASES[\s\S]*?\};\n\n/, "")` contains a literal `}` INSIDE a regex
 * (escaped as `\}`, still just a `}` character to a naive scanner) with no matching `{` nearby, so depth
 * hit 0 and the scan stopped there — several lines before the selftest's own `process.exit(1)`. The
 * selftest was misclassified "fake-green" even though it genuinely exits non-zero on failure (confirmed
 * live: both `node verify-matrix-banking-module-alias-recognized.mjs` and `--selftest` exit 0 cleanly
 * with real assertions running).
 *
 * This walks the source tracking quote state ('  "  `, with backslash-escape handling, same technique as
 * mask-comments.mjs) AND a lightweight regex-literal state, so braces inside any of those spans are
 * invisible to the depth counter — only braces that are genuinely JS code structure count.
 *
 * Regex-vs-division disambiguation uses the standard "regex-permitted-context" heuristic real
 * tokenizers use: a `/` starts a regex literal when the nearest preceding non-whitespace/non-comment
 * token is one that cannot end an expression (an operator, `(`, `[`, `{`, `,`, `;`, `:`, or absent
 * entirely — start of input) or is a keyword that precedes an expression (return/typeof/in/of/new/
 * delete/void/throw/case/instanceof). It is a heuristic, not a full parser, but it is exactly the class
 * of source this guard scans (hand-written verify-*.mjs files, not adversarial input).
 */

const KEYWORD_BEFORE_REGEX = new Set([
  "return", "typeof", "in", "of", "new", "delete", "void", "throw", "case", "instanceof", "yield", "await",
]);

/** Last non-whitespace token text ending at (not including) index `i` in `src`, or "" if none. */
function precedingToken(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return "";
  if (/[A-Za-z0-9_$]/.test(src[j])) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k])) k--;
    return src.slice(k + 1, j + 1);
  }
  return src[j];
}

function regexAllowedHere(src, i) {
  const tok = precedingToken(src, i);
  if (tok === "") return true;
  if (/^[A-Za-z_$]/.test(tok)) return KEYWORD_BEFORE_REGEX.has(tok);
  return /[([{,;:=!&|?+\-*%^~<>]/.test(tok);
}

/**
 * Find the index one PAST the `}` that closes the `{` at `openIndex` (which must itself be `{`),
 * skipping braces inside strings/templates/regexes. Returns `source.length` if unbalanced (never
 * closes) — the caller's existing "ran off the end" handling still applies.
 */
export function findMatchingBraceEnd(source, openIndex) {
  let i = openIndex + 1;
  let depth = 1;
  const n = source.length;
  while (i < n && depth > 0) {
    const c = source[i];
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      i++;
      while (i < n) {
        if (source[i] === "\\") { i += 2; continue; }
        if (source[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === "/" && regexAllowedHere(source, i)) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const cj = source[j];
        if (cj === "\\") { j += 2; continue; }
        if (cj === "[") { inClass = true; j++; continue; }
        if (cj === "]") { inClass = false; j++; continue; }
        if (cj === "/" && !inClass) { j++; break; }
        if (cj === "\n") break; // unterminated on this line — not a regex after all, bail without consuming
        j++;
      }
      if (source[j - 1] === "/" && j > i + 1) {
        while (j < n && /[a-z]/i.test(source[j])) j++; // flags
        i = j;
        continue;
      }
      // Fell through without a real regex close — treat the `/` as an ordinary character.
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return i;
}

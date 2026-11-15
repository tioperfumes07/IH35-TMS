/**
 * ROUND 8.20 "ret" waves wrap navigation targets in a return-context helper — moneyHref(`/accounting/...`),
 * bankHref(...), drvHref(...), acctHref(...), sysHref(...) — each `(target) => withReturnContext(target, originHref)`.
 * The target path is unchanged, so source guards that pin a literal target read it through this unwrap.
 * Only a wrapper whose single argument is one string / template literal is unwrapped; anything else is left as is.
 */
export function unwrapReturnContext(src) {
  if (typeof src !== "string") return src;
  return src
    .replace(/\b[a-z][A-Za-z]*Href\(\s*(`[^`]*`|"[^"\n]*"|'[^'\n]*')\s*\)/g, "$1")
    // to={moneyHref("/x")} unwraps to to={"/x"}, which is the JSX attribute to="/x".
    .replace(/=\{\s*"([^"\n]*)"\s*\}/g, '="$1"')
    .replace(/=\{\s*`([^`$\n]*)`\s*\}/g, '="$1"');
}

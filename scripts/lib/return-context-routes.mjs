// ROUND 8.17 class R / ROUND 8.20: links carry the origin board as ?ret= through a return-context wrapper —
// `const safetyHref = (target: string) => withReturnContext(target, originHref)` then `to={safetyHref("/safety/hos")}`.
// The wrapper only appends ret; the route a guard certifies is its FIRST argument. These helpers let a guard read that
// route exactly, and nothing looser: any other helper call is still not a match.

/** Names of local one-argument arrows whose whole body is `withReturnContext(arg, …)`. */
export function returnContextWrappers(source) {
  return [...String(source ?? "").matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*([A-Za-z_$][\w$]*)\s*(?::\s*string)?\s*\)\s*=>\s*withReturnContext\(\s*\2\s*,/g)].map((m) => m[1]);
}

/** True when the source links `to` the literal route — bare, or inside withReturnContext / a local wrapper. */
export function linksToRoute(source, route) {
  const s = String(source ?? "");
  const q = JSON.stringify(route); // "…"
  if (s.includes(`to=${q}`) || s.includes(`to={${q}}`)) return true;
  if (s.includes(`to={withReturnContext(${q},`)) return true;
  return returnContextWrappers(s).some((w) => s.includes(`to={${w}(${q})}`));
}

export function selftestReturnContextRoutes() {
  const wrapped = 'const safetyHref = (target: string) => withReturnContext(target, originHref);\n<Link to={safetyHref("/safety/hos")}>x</Link>';
  const cases = [
    ['<Link to="/safety/hos">x</Link>', true],
    [wrapped, true],
    ['<Link to={withReturnContext("/safety/hos", o)}>x</Link>', true],
    [wrapped.replace('"/safety/hos"', '"/safety/other"'), false],
    ['const h = (t: string) => other(t, o);\n<Link to={h("/safety/hos")}>x</Link>', false],
  ];
  for (const [src, want] of cases) if (linksToRoute(src, "/safety/hos") !== want) throw new Error(`return-context-routes selftest: ${src}`);
}

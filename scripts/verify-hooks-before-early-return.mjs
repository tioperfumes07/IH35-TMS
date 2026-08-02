#!/usr/bin/env node
/**
 * INS-F01 — no React hook may run AFTER a conditional early return in these components.
 *
 * WHY (React error #310, "rendered fewer hooks than expected"):
 * ClaimsTab guarded on `if (!companyId) return <…/>` and then called useMemo for its column set. On a
 * direct URL load or a refresh of the Insurance Claims tab the company context is not resolved on the
 * first render, so companyId was "" and the component returned early having run 7 hooks; the next
 * render (context resolved) ran 8. React compares hook counts between renders of the same component
 * and throws, crashing the whole tab. It was reachable ONLY by deep link or refresh — clicking to the
 * tab from inside the app never hit it, which is why it survived normal use and broke the one path an
 * operator takes when they paste a link or hit reload.
 *
 * THE RULE: hooks are unconditional; only the RENDER is conditional. The guard itself is correct and
 * must stay — showing a claims grid with no entity selected would be worse — it simply has to run
 * after every hook.
 *
 * SCOPE: the components verified below. This is not a repo-wide lint (eslint react-hooks/rules-of-hooks
 * is the tool for that); it is a ratchet on the specific surfaces where this defect was found and where
 * a deep-linked crash is most costly.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-hooks-before-early-return";

const COMPONENTS = ["apps/frontend/src/pages/insurance/ClaimsTab.tsx"];

// The optional generic argument list is load-bearing. ClaimsTab's only hook after the guard was
// `useMemo<ParityColumn<InsuranceClaim>[]>(` — a name, a GENERIC, then the paren. Without the
// `(?:<...>)?` this regex matched no hook there at all, so the guard passed the very regression it
// exists to catch. Mutation-testing against the real file is what exposed it; the selftest fixture
// used a bare `useMemo(` and was happily green.
const HOOK_RE = /(?:^|[^.\w])(use[A-Z]\w*)\s*(?:<[\s\S]{0,160}?>)?\s*\(/g;
/**
 * Any `return` inside the component body. The first version of this regex required TWO-space
 * indentation and so never matched the real defect, whose return sits inside an `if` block at four —
 * the guard reported OK against source it could not see. Mutation-testing caught it. Indentation is
 * not a reliable marker; the component BODY is, which is why the body is extracted first.
 */
const RETURN_RE = /\n\s{2,}return[\s(<;]/g;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * The component's own body. Scanning the whole FILE would count `return` statements belonging to
 * helper functions defined above the component (ClaimsTab has several), which would make the first
 * "early return" appear before any hook and flag everything.
 */
function componentBody(src) {
  const m = /export (?:default )?function [A-Z]\w*\s*\(/.exec(src);
  return m ? src.slice(m.index) : src;
}

export function auditComponent(rel, srcRaw) {
  const problems = [];
  const src = componentBody(stripComments(srcRaw));

  const firstEarlyReturn = [...src.matchAll(RETURN_RE)].map((m) => m.index).sort((a, b) => a - b)[0];
  if (firstEarlyReturn === undefined) return problems; // no return at all: nothing to violate

  for (const m of src.matchAll(HOOK_RE)) {
    const name = m[1];
    // useCompanyContext-style custom hooks count too — any use* call is a hook call.
    if (m.index > firstEarlyReturn) {
      problems.push(
        `${rel}: ${name}() is called AFTER a conditional early return (return at offset ` +
          `${firstEarlyReturn}, hook at ${m.index}). When the guard fires, this hook does not run and ` +
          `the render commits fewer hooks than the next one — React error #310, which crashes the ` +
          `component on deep-link/refresh. Move every hook above the guard; the guard stays.`
      );
    }
  }
  return problems;
}

function auditTree() {
  const problems = [];
  for (const rel of COMPONENTS) {
    problems.push(...auditComponent(rel, readFileSync(join(ROOT, rel), "utf8")));
  }
  return problems;
}

function selftest() {
  const failures = [];
  if (auditTree().length !== 0) failures.push(`case0 FAIL — real source flagged: ${auditTree().join(" | ")}`);

  // case1 — the INS-F01 defect verbatim: guard above a hook.
  const bug = [
    "export function T() {",
    "  const [a, setA] = useState(0);",
    "",
    "  if (!companyId) {",
    "    return (",
    "      <div>pick a company</div>",
    "    );",
    "  }",
    "",
    "  const cols = useMemo(() => [], []);",
    "  return <div>{cols.length}</div>;",
    "}",
  ].join("\n");
  if (!auditComponent("t.tsx", bug).some((p) => p.includes("useMemo")))
    failures.push("case1 FAIL — a hook after an early return was NOT caught");

  // case2 — the FIX: same guard, moved below the hook, must pass.
  const fixed = [
    "export function T() {",
    "  const [a, setA] = useState(0);",
    "  const cols = useMemo(() => [], []);",
    "",
    "  if (!companyId) {",
    "    return (",
    "      <div>pick a company</div>",
    "    );",
    "  }",
    "  return <div>{cols.length}</div>;",
    "}",
  ].join("\n");
  if (auditComponent("t.tsx", fixed).length !== 0)
    failures.push("case2 FAIL — the corrected order was wrongly flagged");

  // case2b — a hook written WITH a generic argument, which is the real ClaimsTab shape and the form
  // that defeated the first version of HOOK_RE.
  const generic = [
    "export function T() {",
    "  if (!companyId) {",
    "    return (",
    "      <div>pick a company</div>",
    "    );",
    "  }",
    "  const cols = useMemo<ParityColumn<Claim>[]>(() => [], []);",
    "  return <div>{cols.length}</div>;",
    "}",
  ].join("\n");
  if (!auditComponent("t.tsx", generic).some((p) => p.includes("useMemo")))
    failures.push("case2b FAIL — a generic-typed hook after an early return was NOT caught");

  // case3 — a hook name mentioned in a COMMENT must not count as a call.
  const commented = ["export function T() {", "  if (!x) {", "    return null;", "  }", "  // useMemo is fine here", "  return <div/>;", "}"].join("\n");
  if (auditComponent("t.tsx", commented).length !== 0)
    failures.push("case3 FAIL — a hook named only in a comment was treated as a call");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — hook-after-early-return caught, corrected order passes, comments ignored`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every hook runs before any conditional early return`);
}

main();

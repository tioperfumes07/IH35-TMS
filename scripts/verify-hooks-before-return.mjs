#!/usr/bin/env node
/**
 * REACT RULES-OF-HOOKS — every hook must run BEFORE any early return in a component.
 *
 * WHY THIS IS A REAL DEFECT, NOT A LINT PREFERENCE: React identifies hooks by CALL ORDER. A guard
 * clause such as `if (!data) return null;` placed above a `useMemo`/`useEffect` means the hook runs on
 * some renders and not others, so on the render where the guard flips React reads a DIFFERENT hook's
 * state — "Rendered fewer hooks than expected" — and the component tree throws. In this app that
 * lands as a blank screen behind an error boundary, exactly like the owner-homepage P0 caused by an
 * unguarded spread: the page does not misbehave, it disappears.
 *
 * DETECTION (deliberately conservative — a noisy guard gets disabled):
 * inside a component-shaped function (`function Name(`, `const Name = (`, capitalised), flag only when
 * a GUARD-CLAUSE early return at the function's own body level is followed by a hook call at that
 * same body level. Hooks inside nested callbacks, and returns inside nested blocks/JSX, are ignored —
 * they are not the ordering hazard.
 *
 * NOT CLAIMED: this does not replace eslint-plugin-react-hooks where that is configured; it is a
 * repo-level ratchet so the class cannot grow in files eslint does not cover.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-hooks-before-return";
const SRC = "apps/frontend/src";
const BASELINE_PATH = "scripts/hooks-before-return-baseline.json";

const HOOK_CALL = /^\s{2}(?:const|let|var)?\s*[\w{[\],:\s]*=?\s*(use[A-Z]\w*)\s*\(/;
const GUARD_RETURN = /^\s{2}if\s*\(.*\)\s*return\b|^\s{2}return\b/;
const COMPONENT_START = /^(?:export\s+)?(?:default\s+)?(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*\()/;

/**
 * @returns offender keys `file|Component|hook`
 */
export function findLateHooks(src, file = "<mem>") {
  const lines = src.split("\n");
  const out = [];
  let component = null;
  let sawGuardReturn = false;
  for (const line of lines) {
    const start = COMPONENT_START.exec(line);
    if (start) {
      component = start[1] || start[2];
      sawGuardReturn = false;
      continue;
    }
    if (!component) continue;
    if (/^\}/.test(line)) {
      component = null;
      sawGuardReturn = false;
      continue;
    }
    if (GUARD_RETURN.test(line)) {
      sawGuardReturn = true;
      continue;
    }
    const hook = HOOK_CALL.exec(line);
    if (hook && sawGuardReturn) out.push(`${file}|${component}|${hook[1]}`);
  }
  return out;
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "__tests__" || e === "dist") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (rel.endsWith(".tsx") && !rel.includes(".test.")) out.push(rel);
}

function collect() {
  const files = [];
  walk(SRC, files);
  const keys = [];
  for (const rel of files) keys.push(...findLateHooks(readFileSync(join(ROOT, rel), "utf8"), rel));
  return { keys: [...new Set(keys)], fileCount: files.length };
}

function auditTree() {
  const { keys, fileCount } = collect();
  if (fileCount === 0) return [`${LABEL}: no .tsx sources found — scope is wrong, refusing to pass vacuously.`];
  const baselinePath = join(ROOT, BASELINE_PATH);
  if (!existsSync(baselinePath)) return [`${LABEL}: missing ${BASELINE_PATH}. Regenerate with --write-baseline.`];
  const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")).offenders ?? []);
  const added = keys.filter((k) => !baseline.has(k));
  const problems = [];
  if (added.length) {
    problems.push(
      `${added.length} hook(s) called AFTER an early return — React matches hooks by call order, so ` +
        `this throws "Rendered fewer hooks than expected" and blanks the screen:\n  ` +
        added.slice(0, 10).join("\n  ") +
        `\nMove every hook ABOVE the guard clause.`
    );
  }
  if (keys.length > baseline.size) {
    problems.push(`${LABEL}: offender count rose ${baseline.size} -> ${keys.length}. The baseline may only shrink.`);
  }
  return problems;
}

function selftest() {
  const failures = [];
  const bad = `export function Widget({ data }) {
  if (!data) return null;
  const memo = useMemo(() => data.x, [data]);
  return <div>{memo}</div>;
}`;
  if (findLateHooks(bad, "a.tsx").length === 0)
    failures.push("case1 FAIL — a hook after a guard return was NOT caught");

  const good = `export function Widget({ data }) {
  const memo = useMemo(() => data?.x, [data]);
  if (!data) return null;
  return <div>{memo}</div>;
}`;
  if (findLateHooks(good, "a.tsx").length !== 0)
    failures.push("case2 FAIL — correct hook-then-guard order was flagged");

  // A hook inside a nested callback after a return is NOT the ordering hazard.
  const nested = `export function Widget({ data }) {
  if (!data) return null;
  return <List render={() => { const q = useQuery(); return q; }} />;
}`;
  if (findLateHooks(nested, "a.tsx").length !== 0)
    failures.push("case3 FAIL — a hook nested in a callback was flagged (false positive)");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case4 FAIL — real tree flagged against baseline: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — late hook caught, correct order clean, nested callback not flagged`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (process.argv.includes("--write-baseline")) {
    const { keys } = collect();
    writeFileSync(
      join(ROOT, BASELINE_PATH),
      JSON.stringify({ note: "rules-of-hooks ratchet — may only SHRINK.", offenders: keys.sort() }, null, 2) + "\n"
    );
    console.log(`${LABEL}: baseline written with ${keys.length} offender(s)`);
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no hook is called after an early return`);
}

main();

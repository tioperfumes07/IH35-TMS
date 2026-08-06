#!/usr/bin/env node
/**
 * CLS-TEST-PROVIDER-DRIFT — a test's render helper must supply every provider its component needs.
 *
 * THE SILENT-P0 ROOT, twice in one day:
 *   #4475 added `<Link>` to ScenarioTrackerPanel. Its test rendered with no Router, so react-router
 *         threw "Cannot destructure property 'basename'" and ALL THREE tests died — including the
 *         owner-homepage-crash P0. I then mis-reported that breakage as pre-existing.
 *   #4495 moved ScenarioTrackerHome onto TanStack Query. Its test supplied only MemoryRouter, so
 *         every case died on "No QueryClient set".
 * In both, a component quietly ADOPTED a new dependency and the test file was not updated. The tests
 * did not "start failing loudly at the right place" — the whole file threw at render, so a P0
 * regression test can go dead while the suite still looks like it has coverage.
 *
 * WHAT THIS ASSERTS: for each test file, look at the component(s) it imports from a relative path and
 * renders. If that component's source consumes a provider-backed API, the test must mention the
 * matching provider:
 *   useQuery / useMutation / useQueryClient / useInfiniteQuery  ->  QueryClientProvider
 *   useNavigate / useParams / useLocation / <Link / <NavLink    ->  MemoryRouter | BrowserRouter | RouterProvider
 *
 * HONEST LIMITATION, stated not buried: this is ONE LEVEL DEEP — the directly rendered component, not
 * its whole subtree. A provider needed only by a grandchild is not detected. That is deliberate: a
 * full subtree walk needs a module resolver, and a guard that half-guesses at depth produces false
 * positives, gets muted, and protects nothing. One level would have caught BOTH real incidents.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname, resolve } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-test-provider-completeness";
const SRC = "apps/frontend/src";
const BASELINE_PATH = "scripts/test-provider-completeness-baseline.json";

/** provider requirement -> [what the component uses, what the test must supply] */
const REQUIREMENTS = [
  {
    id: "QueryClientProvider",
    componentUses: /\buse(?:Query|Mutation|QueryClient|InfiniteQuery)\s*[(<]/,
    testSupplies: /QueryClientProvider/,
    hint: "wrap the render in <QueryClientProvider client={new QueryClient(...)}>",
  },
  {
    id: "Router",
    componentUses: /\buse(?:Navigate|Params|Location|SearchParams)\s*\(|<Link\b|<NavLink\b/,
    testSupplies: /MemoryRouter|BrowserRouter|RouterProvider/,
    hint: "wrap the render in <MemoryRouter>",
  },
];

/** Components imported from a RELATIVE path (i.e. app code, not a library) and actually rendered. */
export function renderedLocalComponents(testSrc) {
  const imported = new Map(); // name -> relative path
  for (const m of testSrc.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Z]/.test(name)) imported.set(name, m[2]);
    }
  }
  for (const m of testSrc.matchAll(/import\s+([A-Z]\w*)\s+from\s*["'](\.[^"']+)["']/g)) {
    imported.set(m[1], m[2]);
  }
  const rendered = [];
  for (const [name, rel] of imported) {
    if (new RegExp(`<${name}[\\s/>]`).test(testSrc)) rendered.push({ name, rel });
  }
  return rendered;
}

function resolveComponent(testFileAbs, rel) {
  const base = resolve(dirname(testFileAbs), rel);
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

export function auditTestFile(testRel, testSrc, readComponent) {
  const problems = [];
  for (const { name, rel } of renderedLocalComponents(testSrc)) {
    const src = readComponent(rel);
    if (!src) continue; // unresolved import — not this guard's business
    for (const req of REQUIREMENTS) {
      if (!req.componentUses.test(src)) continue;
      if (req.testSupplies.test(testSrc)) continue;
      problems.push(
        `${testRel}: renders <${name}/>, which consumes ${req.id}, but the test never supplies it. ` +
          `The render throws and EVERY case in this file dies at once — a regression test can go dead ` +
          `while the suite still looks covered. Fix: ${req.hint}.`
      );
    }
  }
  return problems;
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "dist") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (/\.test\.tsx$/.test(rel)) out.push(rel);
}

function collect() {
  const tests = [];
  walk(SRC, tests);
  const keys = [];
  for (const testRel of tests) {
    const testAbs = join(ROOT, testRel);
    const testSrc = readFileSync(testAbs, "utf8");
    const problems = auditTestFile(testRel, testSrc, (rel) => {
      const abs = resolveComponent(testAbs, rel);
      return abs ? readFileSync(abs, "utf8") : null;
    });
    for (const p of problems) keys.push(p.split(":")[0] + "|" + (p.match(/renders <(\w+)\/>/)?.[1] ?? "") + "|" + (p.match(/consumes (\w+)/)?.[1] ?? ""));
  }
  return { keys: [...new Set(keys)], testCount: tests.length };
}

function auditTree() {
  const { keys, testCount } = collect();
  if (testCount === 0) return [`${LABEL}: found ZERO .test.tsx files — scope is wrong, refusing to pass vacuously.`];
  const baselinePath = join(ROOT, BASELINE_PATH);
  if (!existsSync(baselinePath)) return [`${LABEL}: missing ${BASELINE_PATH}. Regenerate with --write-baseline.`];
  const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")).offenders ?? []);
  const added = keys.filter((k) => !baseline.has(k));
  const problems = [];
  if (added.length) {
    problems.push(
      `${added.length} test(s) missing a provider their component consumes — the render throws and the ` +
        `whole file dies silently:\n  ` +
        added.slice(0, 10).join("\n  ")
    );
  }
  if (keys.length > baseline.size) {
    problems.push(`${LABEL}: offender count rose ${baseline.size} -> ${keys.length}. The baseline may only shrink.`);
  }
  return problems;
}

function selftest() {
  const failures = [];
  const compQuery = `export function Widget(){ const q = useQuery({}); return <div/>; }`;
  const compLink = `export function Widget(){ return <Link to="/x">x</Link>; }`;

  // #4495 shape: component uses useQuery, test supplies only a router.
  const testRouterOnly = `import { Widget } from "./Widget";
    render(<MemoryRouter><Widget /></MemoryRouter>);`;
  if (auditTestFile("a.test.tsx", testRouterOnly, () => compQuery).length === 0)
    failures.push("case1 FAIL — missing QueryClientProvider was NOT caught (#4495 shape)");

  // #4475 shape: component uses <Link>, test supplies no router at all.
  const testNoRouter = `import { Widget } from "./Widget";
    render(<Widget />);`;
  if (auditTestFile("a.test.tsx", testNoRouter, () => compLink).length === 0)
    failures.push("case2 FAIL — missing Router was NOT caught (#4475 shape)");

  // Correct: both supplied.
  const testBoth = `import { Widget } from "./Widget";
    render(<QueryClientProvider client={c}><MemoryRouter><Widget /></MemoryRouter></QueryClientProvider>);`;
  if (auditTestFile("a.test.tsx", testBoth, () => compQuery + compLink).length !== 0)
    failures.push("case3 FAIL — a fully-provided test was flagged");

  // A component needing nothing must not be demanded of.
  if (auditTestFile("a.test.tsx", testNoRouter, () => "export function Widget(){ return <div/>; }").length !== 0)
    failures.push("case4 FAIL — a provider-free component was flagged");

  // An imported-but-not-rendered component is out of scope.
  const notRendered = `import { Widget } from "./Widget";\n it("x", () => expect(1).toBe(1));`;
  if (auditTestFile("a.test.tsx", notRendered, () => compQuery).length !== 0)
    failures.push("case5 FAIL — an imported-but-unrendered component was flagged");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case6 FAIL — real tree flagged against baseline: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — both real incidents (#4475 Router, #4495 QueryClient) caught; complete tests clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (process.argv.includes("--write-baseline")) {
    const { keys } = collect();
    writeFileSync(
      join(ROOT, BASELINE_PATH),
      JSON.stringify({ note: "CLS-TEST-PROVIDER-DRIFT ratchet — may only SHRINK.", offenders: keys.sort() }, null, 2) + "\n"
    );
    console.log(`${LABEL}: baseline written with ${keys.length} offender(s)`);
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every test supplies the providers its component consumes`);
}

main();

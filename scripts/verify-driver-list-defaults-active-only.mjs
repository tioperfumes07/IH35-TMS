#!/usr/bin/env node
/**
 * DRIVER-VISIBILITY (owner order 2026-09-04, Rule 4 systemwide). Owner, verbatim: "WE KEEP THE
 * ENTIRE DRIVER DATABASE, BUT SHOULD NOT BE SHOWING ALL THOSE DRIVERS, AND IN DRIVER PROFILE TAB
 * ONLY THE ACTIVE DRIVERS SHOULD BE SHOWING." Every operator surface that lists drivers must
 * default to active-only, with an explicit off-by-default "show inactive/all" opt-in -- never the
 * reverse. A deactivated driver already on a record still renders on that record (this guard does
 * not touch per-record display, only roster/picker/list surfaces).
 *
 * AUDIT DONE THIS PASS: the shared EntityPicker (kind="driver", ~180 call sites app-wide) already
 * requests status=["Active"] (or ["Active","Probation"] for money surfaces) plus an isLive() filter
 * -- WIZ-44/FAIL-CA1, prior work, verified correct, not touched. Drivers.tsx's main roster already
 * defaults its `status` tab to "active" via parseDriverListStatus -- prior work, verified correct.
 * The ONE surface found NOT defaulting active-only: DriversListPage.tsx (the Drivers "Profiles" /
 * Safety "Driver Files" DQF compliance list) called listDrivers({status:"All"}) unconditionally
 * with no way to narrow it -- fixed this pass: default status="Active", explicit "Show inactive"
 * checkbox (off by default) widens to "All". Its CSV export button is a deliberate, explicit,
 * user-triggered full-roster export (labelled "Export profiles (CSV)", includes a Status column)
 * and is allowlisted below, not a passive list.
 *
 * This guard has two halves:
 *   (1) NAMED regression lock -- DriversListPage.tsx's row-list query must still pass a
 *       status-that-is-not-a-bare-"All"-literal by default (i.e. gated behind a toggle variable),
 *       and must still render a "Show inactive"-labelled toggle.
 *   (2) SYSTEMIC net -- scans the whole frontend for any `listDrivers(`/`listAllDrivers(` call
 *       passing the literal `status: "All"` (or `status: "all"`) with no nearby toggle marker
 *       (`showInactive`, `show inactive`, `includeInactive`, `include_deactivated`) in the same
 *       file, so a future roster/picker introduced with this same defect fails CI even if never
 *       named here. The known-safe CSV-export call sites are allowlisted by file+function name.
 *
 * Run: node scripts/verify-driver-list-defaults-active-only.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-list-defaults-active-only";

// file -> allowed literal "All"/"all" occurrences (deliberate full-roster reads, not passive lists).
const ALLOWLIST_ALL_LITERALS = {
  "apps/frontend/src/pages/drivers/DriversListPage.tsx": 2, // handleExportCsv's two paged listDrivers calls
  "apps/frontend/src/pages/Drivers.tsx": 1, // admin all-statuses query feeding the client-filtered tab counts
};

const TOGGLE_MARKER_RE = /show\s*inactive|showinactive|includeinactive|include_deactivated/i;

function readSrc(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function listFrontendSourceFiles(root) {
  const dir = path.join(root, "apps/frontend/src");
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

function checkNamedFix(root) {
  const problems = [];
  const file = "apps/frontend/src/pages/drivers/DriversListPage.tsx";
  let src;
  try {
    src = readSrc(root, file);
  } catch {
    problems.push(`${file}: missing`);
    return problems;
  }
  if (!TOGGLE_MARKER_RE.test(src)) {
    problems.push(`${file}: no "Show inactive"-style toggle found -- the active-only-default fix regressed`);
  }
  if (!/status:\s*driverStatusFilter/.test(src)) {
    problems.push(`${file}: main row-list query no longer gates status behind the toggle variable`);
  }
  return problems;
}

function checkSystemicNet(root) {
  const problems = [];
  const CALL_RE = /list(?:All)?Drivers\(\s*\{[^}]*?\bstatus\s*:\s*["'](all|All)["'][^}]*?\}/gs;
  for (const file of listFrontendSourceFiles(root)) {
    const src = fs.readFileSync(file, "utf8");
    const matches = [...src.matchAll(CALL_RE)];
    if (matches.length === 0) continue;
    const rel = path.relative(root, file).split(path.sep).join("/");
    const allowed = ALLOWLIST_ALL_LITERALS[rel] ?? 0;
    if (matches.length <= allowed) continue;
    if (TOGGLE_MARKER_RE.test(src)) continue; // has some toggle marker somewhere in the file -- assume gated
    problems.push(
      `${rel}: list(All)?Drivers(...) called with a literal status:"All" (${matches.length} occurrence(s), ${allowed} allowlisted) and no "show inactive"-style toggle found in the file -- a driver list can default to showing everyone. Either gate it behind an off-by-default toggle or add it to ALLOWLIST_ALL_LITERALS with justification.`
    );
  }
  return problems;
}

export function run(root = ROOT) {
  return [...checkNamedFix(root), ...checkSystemicNet(root)];
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/driver-list-active-only-selftest-");
  const write = (rel, content) => {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  // 1. Named fix present and clean.
  write(
    "apps/frontend/src/pages/drivers/DriversListPage.tsx",
    `const [showInactive, setShowInactive] = useState(false);\nlistDrivers({status: driverStatusFilter});\n`
  );
  const clean = run(dir);
  if (clean.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(clean));

  // 2. Regress the named fix (toggle removed) -> caught.
  write("apps/frontend/src/pages/drivers/DriversListPage.tsx", `listDrivers({status: "All"});\n`);
  const regressed = run(dir);
  if (!regressed.some((p) => p.includes("DriversListPage.tsx"))) {
    throw new Error("FAIL to catch: DriversListPage.tsx regression went undetected");
  }
  write(
    "apps/frontend/src/pages/drivers/DriversListPage.tsx",
    `const [showInactive, setShowInactive] = useState(false);\nlistDrivers({status: driverStatusFilter});\n`
  );

  // 3. Systemic net: a brand-new file with an unguarded status:"All" call -> caught.
  write("apps/frontend/src/pages/some/NewDriverListPage.tsx", `listDrivers({ operating_company_id: x, status: "All" })`);
  const newOffender = run(dir);
  if (!newOffender.some((p) => p.includes("NewDriverListPage.tsx"))) {
    throw new Error("FAIL to catch: a brand-new unguarded status:\"All\" call went undetected");
  }

  // 4. Systemic net: same call but WITH a toggle marker present -> not flagged.
  write(
    "apps/frontend/src/pages/some/HonestDriverListPage.tsx",
    `const [showInactive] = useState(false);\nlistDrivers({ operating_company_id: x, status: "All" })`
  );
  const honest = run(dir).filter((p) => p.includes("HonestDriverListPage.tsx"));
  if (honest.length) throw new Error("FAIL: a toggle-gated status:\"All\" call must not be flagged: " + JSON.stringify(honest));

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — DriversListPage.tsx holds its active-only default + toggle; no new unguarded status:"All" driver-list call site found`);

#!/usr/bin/env node
/**
 * CLS-ORPHAN-SURFACE / LINKAGE LAW §10 — a detail page must embed a way BACK.
 *
 * Forward drill-through is the half everyone builds: a list row links to a record. The reverse half
 * is the half that rots — you land on a detail page from a search result, a notification or a pasted
 * link and there is no route back to the thing that owns it. §10 requires linkage BOTH ways, and §7's
 * module-header law requires a back-arrow + breadcrumb on every module header, precisely so a screen
 * is never a dead end.
 *
 * WHAT COUNTS AS A REVERSE LINK (any one is sufficient — this asserts a contract, not a keyword):
 *   1. `backHref` / `onBack`      — the §7 module header back-arrow
 *   2. `breadcrumb`               — the §7 trail, which is itself navigable
 *   3. `data-testid="*-reverse-drill"` — the explicit reverse-drill marker convention already used by
 *                                        RevenueRecognitionPage
 *   4. an `EntityLink` / `<Link>` to a parent record — a real drill back to the owner
 *      (`EntityLinkOrTombstone` is the governed nullable-label form of the same drill)
 * A page satisfying NONE of these is reachable but not escapable.
 *
 * WHY A MARKER CONTRACT AND NOT A KEYWORD SCAN: the tracker item that requested this
 * (`verify-reverse-drill-required — marker contract, not keyword`) is explicit that grepping for a
 * word produces false green. Any of the four real mechanisms above counts; nothing else does.
 *
 * RATCHET, not a wall: existing detail pages predate the law, so today's offenders are baselined and
 * only NEW ones fail. The list may only shrink.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-reverse-linkage-embedded";
const SRC = "apps/frontend/src/pages";
const BASELINE_PATH = "scripts/reverse-linkage-baseline.json";
const ROUTE_MANIFEST_PATH = "apps/frontend/src/routes/manifest.tsx";

/** Pages whose whole job is to be a drill TARGET. */
const DETAIL_PAGE = /(DetailPage|DetailView|Detail)\.tsx$/;

const REVERSE_MARKERS = [
  /\bbackHref\s*=/,
  /\bonBack\s*=/,
  /\bbreadcrumb\s*=/,
  /<Breadcrumb\b/,
  /data-testid=["'][^"']*reverse-drill["']/,
  /<EntityLinkOrTombstone\b/,
  /<EntityLink\b/,
  /<Link\b/,
];

export function hasReverseLink(src) {
  return REVERSE_MARKERS.some((re) => re.test(src));
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
  if (DETAIL_PAGE.test(rel) && !rel.includes(".test.")) out.push(rel);
}

function collectOffenders() {
  const files = [];
  walk(SRC, files);
  const routeManifest = readFileSync(join(ROOT, ROUTE_MANIFEST_PATH), "utf8");
  const offenders = [];
  for (const rel of files) {
    const source = readFileSync(join(ROOT, rel), "utf8");
    const exportedComponent = source.match(/export function\s+([A-Z][A-Za-z0-9_]*)\s*\(/)?.[1];
    // Embedded detail fragments (hover cards, evidence panels, nested tabs) inherit navigation from
    // their routed owner. Auditing them as standalone pages creates fake reverse-link debt. Route
    // targets are the actual escapable-surface contract.
    if (!exportedComponent || !new RegExp(`\\b${exportedComponent}\\b`).test(routeManifest)) continue;
    if (!hasReverseLink(source)) offenders.push(rel);
  }
  return { offenders, fileCount: files.length };
}

function auditTree() {
  const { offenders, fileCount } = collectOffenders();
  if (fileCount === 0) {
    return [`${LABEL}: found ZERO detail pages — the matcher is stale. Refusing to pass vacuously.`];
  }
  const baselinePath = join(ROOT, BASELINE_PATH);
  if (!existsSync(baselinePath)) return [`${LABEL}: missing ${BASELINE_PATH}. Regenerate with --write-baseline.`];
  const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")).offenders ?? []);
  const added = offenders.filter((f) => !baseline.has(f));
  const problems = [];
  if (added.length) {
    problems.push(
      `${added.length} NEW detail page(s) with NO reverse link — reachable but not escapable:\n  ` +
        added.join("\n  ") +
        `\nAdd one of: PageHeader backHref/breadcrumb (§7 module header), a data-testid="*-reverse-drill" ` +
        `marker, or an EntityLink/Link back to the owning record (§10 linkage both ways).`
    );
  }
  if (offenders.length > baseline.size) {
    problems.push(`${LABEL}: offender count rose ${baseline.size} -> ${offenders.length}. The baseline may only shrink.`);
  }
  return problems;
}

function selftest() {
  const failures = [];
  if (hasReverseLink("export function XDetailPage(){ return <div>nothing</div>; }"))
    failures.push("case1 FAIL — a page with no reverse link was treated as linked");
  if (!hasReverseLink('<PageHeader backHref="/accounting/bills" title="Bill" />'))
    failures.push("case2 FAIL — backHref was not accepted");
  if (!hasReverseLink('<PageHeader breadcrumb={["Accounting","Bill"]} />'))
    failures.push("case3 FAIL — breadcrumb was not accepted");
  if (!hasReverseLink('<div data-testid="revenue-recognition-reverse-drill">'))
    failures.push("case4 FAIL — the reverse-drill marker was not accepted");
  if (!hasReverseLink('<EntityLink kind="vendor" id={x} />'))
    failures.push("case5 FAIL — an EntityLink back to the owner was not accepted");
  if (!hasReverseLink('<EntityLinkOrTombstone kind="driver" id={id} name={driverName} noun="Driver" />'))
    failures.push("case6 FAIL — a governed nullable-label EntityLink back to the owner was not accepted");
  if (!hasReverseLink('<Breadcrumb items={[{ label: "Loads", href: "/dispatch" }]} />'))
    failures.push("case7 FAIL — a navigable Breadcrumb was not accepted");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case8 FAIL — real tree flagged against baseline: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — bare page caught; backHref/breadcrumb/marker/EntityLink/EntityLinkOrTombstone all accepted`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (process.argv.includes("--write-baseline")) {
    const { offenders } = collectOffenders();
    writeFileSync(
      join(ROOT, BASELINE_PATH),
      JSON.stringify(
        { note: "CLS-ORPHAN-SURFACE reverse-linkage ratchet — may only SHRINK.", offenders: offenders.sort() },
        null,
        2
      ) + "\n"
    );
    console.log(`${LABEL}: baseline written with ${offenders.length} offender(s)`);
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every detail page embeds a reverse link`);
}

main();

#!/usr/bin/env node
/** @matrix-built {"modules":["lists","maintenance"],"cols":["connectivity"],"leafRe":"^(hub\\.|catalog\\.|wo\\.|parts\\.|vendors\\.)","task":"P46","pr":"#5806"} */
/**
 * CLS-SILENT-CAP (frontend half) — a list that fetches a HARD CAP and never tells the user it capped.
 *
 * THE DEFECT, in the shape it actually shipped: legal.matters listed with a bare `LIMIT 500`, no offset
 * and no total. Matter 501 simply did not exist as far as the screen was concerned. A cap the caller
 * cannot see is indistinguishable from "there is no more data" — the user is not warned, nothing errors,
 * and the missing rows are silently absent from a legal-evidence surface. The drivers instance (inst.1)
 * was worse: the cap exceeded the backend's own max, so the request 400'd and the export produced no
 * file AND no error.
 *
 * WHY THIS GUARD EXISTS SEPARATELY FROM verify-mdata-list-pagination: that guard is BACKEND-side and
 * asserts five named route files return a `total`. Returning a total is necessary and not sufficient —
 * nothing asserted the UI ever SURFACES it. A backend can hand over `total: 4213` and the screen can
 * still render 200 rows with no count, no pager, and no hint. This is the missing half.
 *
 * WHAT IT ASSERTS: a frontend file that requests a hardcoded page size >= MIN_CAP must also show some
 * evidence of handling the boundary — a total/count, a pager, offset/page state, or an infinite query.
 * Files that do neither are silent caps.
 *
 * NOT CLAIMED: this is a static heuristic over co-occurring text, not proof the number rendered is
 * correct or that the pager actually reaches the last row. It cannot detect a cap assembled at runtime
 * from a variable. It catches the shape that shipped three times; it is a ratchet, not an oracle.
 * The baseline is therefore an inventory of EXISTING debt, not an assertion that those screens are fine.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-no-silent-list-caps";
const SRC = "apps/frontend/src";
const BASELINE_PATH = "scripts/silent-list-cap-baseline.json";

/** Below this, a literal is a legitimate small fetch (a dropdown, a preview strip), not a list cap. */
const MIN_CAP = 100;

/** `limit: 200` / `limit=200` / `&limit=200` / `limit=${200}` */
const CAP_RE = /\blimit\s*[:=]\s*\{?\s*(\d{2,6})\b/gi;

/**
 * Evidence that the boundary is handled at all. Deliberately GENEROUS: the guard's job is to find
 * screens with NO boundary handling whatsoever, not to grade the quality of the pager. A false
 * accusation here costs more than a miss, because it pushes people to add cosmetic text.
 */
const HANDLES_BOUNDARY = [
  /\btotal\b/i,
  /_total_count/,
  /\bcount\b/i,
  /\boffset\b/i,
  /\bhasMore\b/i,
  /\bnextPage\b/i,
  /\bnextCursor\b/i,
  /useInfiniteQuery/,
  /\bsetPage\b/,
  /\bpageSize\b/i,
  /Showing\s/,
  /\bPagination\b/,
  // The canonical disclosure component (CLS-SILENT-CAP). It renders "Showing N of M" — or "Showing the
  // first N" when the endpoint returns no total — and renders NOTHING until the cap is actually hit.
  // Recognised here so that adopting the shared component is what shrinks this baseline; without it the
  // guard would keep flagging screens that had been properly fixed, which is how a guard trains people
  // to paste the word "total" into a comment instead of fixing anything.
  /\bCappedListNotice\b/,
];

export function auditFile(src, file = "<mem>") {
  // Comments are not requests. Ignore them when finding caps so prose such as
  // `listDrivers(limit:200)` cannot create a false finding. Boundary handling retains the historical
  // source-wide baseline semantics; tightening that separately is a cross-lane debt sweep.
  const executable = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const caps = [];
  for (const m of executable.matchAll(CAP_RE)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= MIN_CAP) caps.push(n);
  }
  if (caps.length === 0) return [];
  if (HANDLES_BOUNDARY.some((re) => re.test(src))) return [];
  return [
    `${file}: fetches a hardcoded cap (limit=${[...new Set(caps)].join(", ")}) with no total, pager, ` +
      `offset or infinite query anywhere in the file. Row ${Math.min(...caps) + 1} is invisible and the ` +
      `screen cannot tell the user it stopped — the legal.matters LIMIT 500 shape. Surface the total ` +
      `(the mdata list endpoints already return one) or page through it.`,
  ];
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "dist" || e === "__tests__") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (/\.(tsx|ts)$/.test(rel) && !rel.includes(".test.") && !rel.endsWith(".d.ts")) out.push(rel);
}

function collect() {
  const files = [];
  walk(SRC, files);
  const offenders = [];
  for (const rel of files) {
    for (const p of auditFile(readFileSync(join(ROOT, rel), "utf8"), rel)) offenders.push(p.split(":")[0]);
  }
  return { offenders: [...new Set(offenders)].sort(), scanned: files.length };
}

/**
 * OVER-CAP: a frontend request whose hardcoded `limit=N` EXCEEDS the backend's own `z…max(M)`.
 *
 * ★ THIS GUARD ALREADY DESCRIBED THE DEFECT AND NEVER ASSERTED IT (added 2026-08-11). The header above
 * says of the drivers instance: "the cap exceeded the backend's own max, so the request 400'd and the
 * export produced no file AND no error." True — and nothing here checked for it, so
 * `apps/frontend/src/api/accounting.ts:1378` sat on main requesting
 * `/api/v1/catalogs/classes?…&limit=300` while `catalogs/classes.routes.ts:12` declares
 * `limit: z.coerce.number().int().min(1).max(200)`. Every Manual-JE and Driver-Detail class picker
 * 400'd on open — the pickers were simply dead, and the silent-cap baseline had nothing to say about it
 * because the request never returned a capped list at all. A guard that narrates a failure mode in prose
 * while asserting nothing about it is documentation, not enforcement.
 *
 * HARD ZERO, not a ratchet: exceeding a declared max is never a judgement call, it is a guaranteed 400.
 * Resolution is conservative — the FE limit is compared against the LARGEST limit max declared in the
 * route file that owns the path, so a file with several schemas cannot produce a false positive.
 */
const FE_LIMIT_CALL = /["'`](\/api\/v1\/[a-zA-Z0-9/_-]+)\?[^"'`]*?\blimit=(\d+)/g;
const BACKEND_LIMIT_MAX = /limit:\s*z\.coerce\.number\(\)[^,;\n]*?\.max\((\d+)\)/g;

function backendLimitMaxFor(apiPath) {
  const backendSrc = join(ROOT, "apps/backend/src");
  if (!existsSync(backendSrc)) return null;
  const routeFiles = [];
  walkAbs(backendSrc, routeFiles);
  const decl = new RegExp(String.raw`app\.(?:get|post)\s*\(\s*["'\`]${apiPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`);
  for (const file of routeFiles) {
    const src = readFileSync(file, "utf8");
    if (!decl.test(src)) continue;
    const maxes = [...src.matchAll(BACKEND_LIMIT_MAX)].map((m) => Number(m[1]));
    if (maxes.length) return Math.max(...maxes);
  }
  return null;
}

function walkAbs(dir, out) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkAbs(p, out);
    else if (p.endsWith(".ts") && !p.includes(".test.")) out.push(p);
  }
  return out;
}

export function auditOverCap(feSources) {
  const problems = [];
  for (const [rel, src] of feSources) {
    for (const m of src.matchAll(FE_LIMIT_CALL)) {
      const [, apiPath, rawLimit] = m;
      const requested = Number(rawLimit);
      const max = backendLimitMaxFor(apiPath);
      if (max != null && requested > max) {
        problems.push(
          `${rel}: requests ${apiPath}?…limit=${requested}, but the backend declares max(${max}). ` +
            `The request 400s — the list is not capped, it is DEAD, with no rows and no error shown.`
        );
      }
    }
  }
  return problems;
}

/**
 * The maintenance catalogs share a typed client, so their list request does not contain a literal API
 * URL for auditOverCap to resolve. Compare that shared page's requested limit directly with the shared
 * backend schema instead. This is the exact shape that made every maintenance catalog route return 400.
 */
export function auditMaintenanceCatalogCap(frontendSource, backendSource) {
  const requested = frontendSource.match(/client\.list\(\{[\s\S]*?\blimit:\s*(\d+)/)?.[1];
  const max = backendSource.match(/\blimit:\s*z\.coerce\.number\(\)[^,;\n]*?\.max\((\d+)\)/)?.[1];
  if (!requested || !max) {
    return [
      `${LABEL}: could not resolve the maintenance catalog frontend limit and backend max; ` +
        `refusing to let a contract rewrite disable the guard vacuously.`,
    ];
  }
  if (Number(requested) <= Number(max)) return [];
  return [
    `MaintenanceCatalogListPage requests limit=${requested}, but maintenance shared schema declares ` +
      `max(${max}). Every maintenance catalog list request 400s.`,
  ];
}

function auditTree() {
  const { offenders, scanned } = collect();
  if (scanned === 0) {
    return [`${LABEL}: scanned ZERO frontend sources — the scope is wrong, refusing to pass vacuously.`];
  }
  const baselinePath = join(ROOT, BASELINE_PATH);
  if (!existsSync(baselinePath)) return [`${LABEL}: missing ${BASELINE_PATH}. Generate with --write-baseline.`];
  const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")).offenders ?? []);
  const problems = [];
  const added = offenders.filter((f) => !baseline.has(f));
  if (added.length) {
    problems.push(
      `${added.length} NEW silent list cap(s) — a capped list that never tells the user it capped:\n  ` +
        added.slice(0, 15).join("\n  ")
    );
  }
  if (offenders.length > baseline.size) {
    problems.push(`${LABEL}: offender count rose ${baseline.size} -> ${offenders.length}. The baseline may only SHRINK.`);
  }

  // OVER-CAP is a hard zero — it is a guaranteed 400, never a judgement call, so it is not baselined.
  const feFiles = [];
  walk(SRC, feFiles);
  problems.push(...auditOverCap(feFiles.map((rel) => [rel, readFileSync(join(ROOT, rel), "utf8")])));
  problems.push(
    ...auditMaintenanceCatalogCap(
      readFileSync(join(ROOT, "apps/frontend/src/pages/lists/maintenance/MaintenanceCatalogListPage.tsx"), "utf8"),
      readFileSync(join(ROOT, "apps/backend/src/catalogs/maintenance/shared.ts"), "utf8")
    )
  );

  return problems;
}

function selftest() {
  const failures = [];

  // The shape that shipped: a hard cap, nothing else.
  const bad = `const { data } = useQuery({ queryKey: ["m"], queryFn: () => api.list({ limit: 500 }) });`;
  if (auditFile(bad).length === 0) failures.push("case1 FAIL — a bare capped fetch was NOT caught");

  // Same cap, but the screen surfaces the total → not this defect.
  const withTotal = bad + `\nreturn <div>Showing {rows.length} of {data.total}</div>;`;
  if (auditFile(withTotal).length !== 0) failures.push("case2 FAIL — a capped fetch that surfaces total was flagged");

  // Same cap, paged via offset → not this defect.
  const withOffset = `api.list({ limit: 200, offset: page * 200 })`;
  if (auditFile(withOffset).length !== 0) failures.push("case3 FAIL — an offset-paged fetch was flagged");

  // A small fetch is a dropdown, not a list cap.
  const small = `api.list({ limit: 25 })`;
  if (auditFile(small).length !== 0) failures.push("case4 FAIL — a small non-list fetch was flagged");

  // No limit at all → out of scope.
  if (auditFile(`api.list({})`).length !== 0) failures.push("case5 FAIL — a fetch with no cap was flagged");

  // useInfiniteQuery handles the boundary by construction.
  const infinite = `useInfiniteQuery({ queryFn: ({ pageParam }) => api.list({ limit: 100, cursor: pageParam }) })`;
  if (auditFile(infinite).length !== 0) failures.push("case6 FAIL — an infinite query was flagged");

  const maintenanceFrontendPath = join(
    ROOT,
    "apps/frontend/src/pages/lists/maintenance/MaintenanceCatalogListPage.tsx"
  );
  const maintenanceBackendPath = join(ROOT, "apps/backend/src/catalogs/maintenance/shared.ts");
  const maintenanceGood = readFileSync(maintenanceFrontendPath, "utf8");
  const maintenanceBackend = readFileSync(maintenanceBackendPath, "utf8");
  const maintenanceBad = maintenanceGood.replace(/\blimit:\s*200\b/, "limit: 500");
  if (maintenanceBad === maintenanceGood) {
    failures.push("case7 FAIL — maintenance over-cap mutation was inert");
  }
  if (auditMaintenanceCatalogCap(maintenanceBad, maintenanceBackend).length === 0) {
    failures.push("case8 FAIL — maintenance request above the backend max was NOT caught");
  }
  if (auditMaintenanceCatalogCap(maintenanceGood, maintenanceBackend).length !== 0) {
    failures.push("case9 FAIL — maintenance request at the backend max was flagged");
  }

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case10 FAIL — real tree flagged against baseline: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — bare cap caught; total/offset/infinite/small-fetch all correctly cleared`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (process.argv.includes("--write-baseline")) {
    const { offenders, scanned } = collect();
    writeFileSync(
      join(ROOT, BASELINE_PATH),
      JSON.stringify(
        {
          note:
            "CLS-SILENT-CAP (frontend) ratchet — screens that fetch a hard cap and never surface it. " +
            "This is an inventory of EXISTING debt, not an approval of these screens. May only SHRINK.",
          scanned,
          offenders,
        },
        null,
        2
      ) + "\n"
    );
    console.log(`${LABEL}: baseline written — ${offenders.length} offender(s) across ${scanned} files.`);
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no NEW silent list caps`);
}

main();

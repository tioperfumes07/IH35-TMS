#!/usr/bin/env node
/**
 * MDATA-F09 class — a route may not set the RLS scope to a company the CALLER named, unless it has
 * first proven the caller belongs to that company.
 *
 * `SET app.operating_company_id` is what every FORCED-RLS policy in this schema reads. When the value
 * handed to it comes from the query string / body / params, the caller is choosing the scope RLS will
 * enforce, so RLS authorizes nothing — it faithfully enforces whatever the attacker asked for. Under
 * PERMANENT LAW 4 this is not theoretical: org.user_accessible_company_ids() returns EVERY active
 * company for an Owner, so even an "accessible companies" predicate is not a membership check.
 *
 * Found live on POST /api/v1/mdata/drivers/:id/messages (MDATA-F09): operating_company_id arrived in
 * the QUERY STRING, validated only as a UUID, fed straight into set_config, and the handler then sent a
 * REAL SMS/email to a caller-named driver id. There was no role check on the route at all.
 *
 * WHY A NEW GUARD: verify-company-membership-assert already covers assert-before-GUC ordering, but it
 * is OPT-IN BY IMPORT — its own summary says it scans "auto-discovered HELPER-CONSUMING tenant-scope
 * files", so a handler enters scope only once it ALREADY imports the membership helper. A handler with
 * zero asserts — exactly the vulnerable state — is invisible to it. This guard keys on the DANGEROUS
 * INPUT instead, so it sees code that has no protection at all.
 *
 * RATCHET, not a hard zero. The first full-tree run found 75 pre-existing ungated sites across
 * compliance, mdata, telematics, fleet, EDI and shipper-portal. Fixing 75 handlers blind would be
 * reckless, and failing the build on all of them would just get the guard disabled. So the known set is
 * pinned in a baseline and may only SHRINK: a new or newly-tainted handler fails immediately, and the
 * drain is tracked as an open class on the board. Keys are line-independent (`file|METHOD|url`) so the
 * baseline does not churn when unrelated code moves.
 *
 * Usage: node scripts/verify-caller-scoped-guc-membership.mjs [--write-baseline] [--selftest]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps/backend/src");
const BASELINE_PATH = "scripts/caller-scoped-guc-membership-baseline.json";
const LABEL = "verify-caller-scoped-guc-membership";
const UNIT_ROUTES_PATH = join(ROOT, "apps/backend/src/mdata/units.routes.ts");
const UNIT_PDF_ROUTES_PATH = join(ROOT, "apps/backend/src/mdata/unit-pdf-export.routes.ts");

/** set_config('app.operating_company_id', …) together with the argument list that follows it. */
const GUC_CALL = /set_config\(\s*['"`]app\.operating_company_id['"`][\s\S]{0,400}?\)\s*;/g;

/** The value handed to the GUC traces to something the caller controls. */
const CALLER_SUPPLIED =
  /\b(?:query|body|params|parsedQuery|parsedBody|parsedParams|q|b)\.data\.\w*(?:operating_)?company\w*|req\.(?:query|body|params)\b/;

/**
 * Something in the enclosing handler authorizes the company before the GUC is set.
 * resolveOperatingCompanyId counts: it validates a requested company against the caller's accessible
 * set and throws forbidden_company_membership. A `membership-scope-exempt:` comment counts only with a
 * written reason next to it — the same marker the sibling guard uses.
 */
const AUTHORIZED =
  /assertCompanyMembership\(|resolveOperatingCompanyId\(|membership-scope-exempt:|user_accessible_company_ids/;

const ROUTE_DECL = /app\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/;
const HANDLER_START = /(?:app\.(?:get|post|put|patch|delete)\s*\(|export\s+async\s+function\s+\w+)/gm;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.routes\.ts$/.test(e) && !/\.(test|spec)\.ts$/.test(e)) out.push(p);
  }
  return out;
}

function handlerStart(src, index) {
  HANDLER_START.lastIndex = 0;
  let start = 0;
  let m;
  while ((m = HANDLER_START.exec(src)) !== null) {
    if (m.index >= index) break;
    start = m.index;
  }
  return start;
}

/** Line-independent key so the baseline survives unrelated edits. */
function keyFor(label, scope) {
  const m = scope.match(ROUTE_DECL);
  return m ? `${label}|${m[1].toUpperCase()}|${m[2]}` : `${label}|FN|${scope.slice(0, 60).replace(/\s+/g, " ").trim()}`;
}

export function auditSource(src, label) {
  const found = [];
  for (const m of src.matchAll(GUC_CALL)) {
    if (!CALLER_SUPPLIED.test(m[0])) continue;
    const scope = src.slice(handlerStart(src, m.index), m.index);
    if (AUTHORIZED.test(scope)) continue;
    found.push({
      key: keyFor(label, src.slice(handlerStart(src, m.index), m.index + 200)),
      line: src.slice(0, m.index).split("\n").length,
      label,
    });
  }
  return found;
}

// RE-ANCHOR (found stale 2026-08-29): this route's registration was reformatted onto multiple
// lines (`app.get(\n  "/api/v1/mdata/units/:id",\n  ...`), so the single-line literal marker never
// matched — the whole check silently returned "missing unit aggregate route" on CORRECT code. The
// two body regexes below were similarly reformatted (args moved onto their own lines with trailing
// commas). All three are now whitespace/trailing-comma tolerant.
function unitAggregateRouteFailures(src) {
  const marker = /app\.get\(\s*["']\/api\/v1\/mdata\/units\/:id["']/;
  const m = marker.exec(src);
  if (!m) return ["missing unit aggregate route"];
  const route = src.slice(m.index, m.index + 2200);
  const resolvesCallerCompany =
    /resolveOperatingCompanyId\(\s*client,\s*authUser\.uuid,\s*parsedQuery\.data\.operating_company_id,?\s*\)/.test(route);
  const passesResolvedCompany = /buildUnitAggregate\(\s*client,\s*parsedParams\.data\.id,\s*scopedCompanyId,?\s*\)/.test(route);
  return [
    !resolvesCallerCompany ? "unit aggregate must membership-resolve caller company" : null,
    !passesResolvedCompany ? "unit aggregate must receive only the resolved company" : null,
  ].filter(Boolean);
}

function unitPdfAggregateRouteFailures(src) {
  const resolvesCallerCompany =
    /resolveOperatingCompanyId\(\s*client,\s*authUser\.uuid,\s*query\.data\.operating_company_id,?\s*\)/.test(src);
  const passesResolvedCompany = /buildUnitAggregate\(\s*client,\s*params\.data\.id,\s*scopedCompanyId,?\s*\)/.test(src);
  return [
    !resolvesCallerCompany ? "unit PDF export must membership-resolve caller company" : null,
    !passesResolvedCompany ? "unit PDF export must receive only the resolved company" : null,
  ].filter(Boolean);
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["gated by assertCompanyMembership", `app.post("/a", async () => { await assertCompanyMembership(c,u,query.data.operating_company_id); await c.query(\`SELECT set_config('app.operating_company_id', $1, true)\`, [query.data.operating_company_id]); });`, 0],
    ["MDATA-F09 shape: caller-supplied, ungated", `app.post("/a", async () => { await c.query(\`SELECT set_config('app.operating_company_id', $1, true)\`, [query.data.operating_company_id]); });`, 1],
    ["gated by resolveOperatingCompanyId", `app.get("/a", async () => { const s = await resolveOperatingCompanyId(c,u,body.data.operating_company_id); await c.query(\`SELECT set_config('app.operating_company_id', $1, true)\`, [s]); });`, 0],
    ["server-derived value is not caller-supplied", `app.get("/a", async () => { await c.query(\`SELECT set_config('app.operating_company_id', $1, true)\`, [authUser.defaultCompanyId]); });`, 0],
    ["exempt marker with a reason", `app.post("/a", async () => { /* membership-scope-exempt: resolved from user_accessible_company_ids */ await c.query(\`SELECT set_config('app.operating_company_id', $1, true)\`, [query.data.operating_company_id]); });`, 0],
    ["laundering: assert in a DIFFERENT route in the same file", `app.post("/a", async () => { await assertCompanyMembership(c,u,x); });\napp.post("/b", async () => { await c.query(\`SELECT set_config('app.operating_company_id', $1, true)\`, [query.data.operating_company_id]); });`, 1],
    ["assert AFTER the GUC set is too late", `app.post("/a", async () => { await c.query(\`SELECT set_config('app.operating_company_id', $1, true)\`, [query.data.operating_company_id]); await assertCompanyMembership(c,u,query.data.operating_company_id); });`, 1],
    ["no GUC set at all", `app.get("/a", async () => { await c.query("SELECT 1"); });`, 0],
  ];
  let bad = 0;
  for (const [name, src, expect] of cases) {
    const got = auditSource(src, "t.routes.ts").length;
    if (got !== expect) { bad++; console.error(`  selftest FAIL: ${name} — expected ${expect}, got ${got}`); }
  }
  const unitRoutes = readFileSync(UNIT_ROUTES_PATH, "utf8");
  const goodUnitFailures = unitAggregateRouteFailures(unitRoutes);
  if (goodUnitFailures.length) {
    bad++;
    console.error(`  selftest FAIL: production unit aggregate rejected — ${goodUnitFailures.join(", ")}`);
  }
  // RE-ANCHOR (found stale 2026-08-29): both mutations below hardcoded the exact
  // whitespace/line-break shape of these two call sites. A reformat (prettier moved
  // resolveOperatingCompanyId's args and buildUnitAggregate's args onto their own lines with
  // trailing commas) left both literal anchors matching nothing, so the mutations were silent
  // no-ops — the real code is still correct (membership-resolved company only), the guard was just
  // blind to a regression. Regex-based, whitespace-tolerant anchors instead of exact literal text.
  const unitMutations = [
    [
      "unit resolver removed",
      unitRoutes.replace(
        /(const scopedCompanyId = await resolveOperatingCompanyId\(\s*client,\s*authUser\.uuid,\s*)parsedQuery\.data\.operating_company_id,?(\s*\);)/,
        "$1authUser.defaultCompanyId$2"
      ),
      "membership-resolve caller company",
    ],
    [
      "caller company passed to builder",
      unitRoutes.replace(
        /(return buildUnitAggregate\(\s*client,\s*parsedParams\.data\.id,\s*)scopedCompanyId,?(\s*\);)/,
        "$1parsedQuery.data.operating_company_id$2"
      ),
      "receive only the resolved company",
    ],
  ];
  for (const [name, mutant, expected] of unitMutations) {
    if (mutant === unitRoutes || !unitAggregateRouteFailures(mutant).some((failure) => failure.includes(expected))) {
      bad++;
      console.error(`  selftest FAIL: ${name} mutation escaped`);
    }
  }
  const unitPdfRoutes = readFileSync(UNIT_PDF_ROUTES_PATH, "utf8");
  const goodUnitPdfFailures = unitPdfAggregateRouteFailures(unitPdfRoutes);
  if (goodUnitPdfFailures.length) {
    bad++;
    console.error(`  selftest FAIL: production unit PDF export rejected — ${goodUnitPdfFailures.join(", ")}`);
  }
  const unitPdfMutations = [
    [
      "unit PDF resolver removed",
      unitPdfRoutes.replace("query.data.operating_company_id\n      );", "authUser.defaultCompanyId\n      );"),
      "membership-resolve caller company",
    ],
    [
      "caller company passed to unit PDF builder",
      unitPdfRoutes.replace(
        "buildUnitAggregate(client, params.data.id, scopedCompanyId)",
        "buildUnitAggregate(client, params.data.id, query.data.operating_company_id)"
      ),
      "receive only the resolved company",
    ],
  ];
  for (const [name, mutant, expected] of unitPdfMutations) {
    if (mutant === unitPdfRoutes || !unitPdfAggregateRouteFailures(mutant).some((failure) => failure.includes(expected))) {
      bad++;
      console.error(`  selftest FAIL: ${name} mutation escaped`);
    }
  }
  if (bad) { console.error(`${LABEL} --selftest: ${bad} case(s) failed`); process.exit(1); }
  console.log(`${LABEL} --selftest: ${cases.length + unitMutations.length + unitPdfMutations.length} cases pass`);
  process.exit(0);
}

const current = [];
for (const f of walk(SRC)) {
  const src = readFileSync(f, "utf8");
  if (!src.includes("app.operating_company_id")) continue;
  current.push(...auditSource(src, relative(ROOT, f)));
}
const currentKeys = [...new Set(current.map((c) => c.key))].sort();
const unitAggregateFailures = unitAggregateRouteFailures(readFileSync(UNIT_ROUTES_PATH, "utf8"));
if (unitAggregateFailures.length) {
  console.error(`FAIL ${LABEL} — indirect caller-scoped unit aggregate:\n  - ${unitAggregateFailures.join("\n  - ")}`);
  process.exit(1);
}
const unitPdfAggregateFailures = unitPdfAggregateRouteFailures(readFileSync(UNIT_PDF_ROUTES_PATH, "utf8"));
if (unitPdfAggregateFailures.length) {
  console.error(`FAIL ${LABEL} — indirect caller-scoped unit PDF aggregate:\n  - ${unitPdfAggregateFailures.join("\n  - ")}`);
  process.exit(1);
}

if (process.argv.includes("--write-baseline")) {
  writeFileSync(join(ROOT, BASELINE_PATH), `${JSON.stringify(currentKeys, null, 2)}\n`);
  console.log(`${LABEL}: baseline written — ${currentKeys.length} ungated caller-scoped GUC site(s).`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), "utf8"));
} catch {
  console.error(`FAIL ${LABEL}: baseline missing at ${BASELINE_PATH} — run with --write-baseline.`);
  process.exit(1);
}
const baselineSet = new Set(baseline);
const added = currentKeys.filter((k) => !baselineSet.has(k));

if (added.length) {
  console.error(`FAIL ${LABEL} — new route sets the RLS scope from caller-supplied input with no membership assert (MDATA-F09 class):`);
  for (const k of added) {
    const hit = current.find((c) => c.key === k);
    console.error(`  · ${hit.label}:${hit.line}  [${k.split("|").slice(1).join(" ")}]`);
  }
  console.error(`\n  set_config('app.operating_company_id', …) is what every FORCED-RLS policy reads. If the value`);
  console.error(`  comes from the caller, RLS enforces whatever the caller asked for. Add`);
  console.error(`  assertCompanyMembership(client, authUser.uuid, <company>) BEFORE the GUC set, or resolve the`);
  console.error(`  company with resolveOperatingCompanyId, or add a "membership-scope-exempt: <reason>" comment.`);
  console.error(`  The baseline may only SHRINK — do not add to it.`);
  process.exit(1);
}

const fixed = baseline.filter((k) => !currentKeys.includes(k));
if (fixed.length) {
  console.log(`${LABEL}: OK — ${fixed.length} baseline site(s) now gated. Re-run with --write-baseline to tighten the ratchet.`);
} else {
  console.log(`${LABEL}: OK — ratchet holding at ${currentKeys.length} known ungated caller-scoped GUC site(s); 0 new.`);
}

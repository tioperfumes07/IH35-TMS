#!/usr/bin/env node
/**
 * GUARD: the Safety dashboard KPI tiles must be fed by real, computed values.
 *
 * WHY THIS EXISTS (2026-07-23 live audit, TRANSP on prod)
 * Every tile on the Safety dashboard read 0 while the fleet had 82 active drivers:
 *
 *   1. SafetyKpiRow bound `active_drivers`, `drivers_with_open_fines`, `open_company_violations`,
 *      `critical_integrity_alerts`, `open_liabilities` — field names the KPI endpoint NEVER
 *      returned. Each resolved `undefined ?? 0`, so the tiles were decorative.
 *   2. The endpoint read `views.safety_dashboard_kpis`, which migration 0045 installs as a
 *      `SELECT ... WHERE false` STUB whenever safety.safety_events does not yet exist. It didn't,
 *      so the stub was installed and never recreated — the view returns zero rows on prod forever.
 *   3. The pending-acks query selected `acknowledgment_uuid` FROM driver_finance.driver_liabilities,
 *      a column that does not exist on that table (it lives on
 *      views.liabilities_active_with_context). The query threw on every call.
 *   4. Every one of those failures was wrapped in `.catch(() => ...0)`, so a broken query rendered
 *      byte-identically to a genuine all-clear. That is what hid this for so long — on a SAFETY
 *      screen, which is the worst place for a false all-clear.
 *
 * The binding check (assertion 1) is the important one: it ties the component and the route
 * together, so adding a tile without a matching API field fails CI instead of shipping a zero.
 *
 * RATCHET: this guard has no baseline. All four assertions must hold.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = path.join(ROOT, "apps/backend/src/safety/safety.routes.ts");
const COMPONENT = path.join(ROOT, "apps/frontend/src/pages/safety/components/SafetyKpiRow.tsx");
const LABEL = "verify-safety-dashboard-kpis-wired";
const SELFTEST = process.argv.includes("--selftest");

const read = (p) => fs.readFileSync(p, "utf8");

/** Strip comments so a rule never matches its own explanatory prose. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The KPI handler body: from the route registration to the end of that handler. */
function kpiHandler(routeSrc) {
  const start = routeSrc.indexOf('app.get("/api/v1/safety/dashboard/kpis"');
  if (start === -1) return null;
  const next = routeSrc.indexOf('app.get("/api/v1/safety/events"', start);
  return routeSrc.slice(start, next === -1 ? routeSrc.length : next);
}

/** Brace-balanced body of the handler's `return { ... }` object literal (empty string if absent). */
function returnedKeys(code) {
  const m = /return\s*\{/.exec(code);
  if (!m) return "";
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < code.length && depth > 0) {
    const ch = code[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return code.slice(m.index, i);
}

/**
 * Assertions are injectable so the selftest can run them against MUTATED copies of the real
 * files — each mutation deletes exactly what one assertion requires.
 */
export function assertKpisWired(sources) {
  const routeSrc = sources?.route ?? read(ROUTE);
  const componentSrc = sources?.component ?? read(COMPONENT);
  const problems = [];

  const handler = kpiHandler(routeSrc);
  if (!handler) {
    problems.push("KPI handler /api/v1/safety/dashboard/kpis not found in safety.routes.ts");
    return problems;
  }
  const code = stripComments(handler);

  // 1. Every field the component binds must be returned by the handler.
  const bound = [...new Set([...stripComments(componentSrc).matchAll(/kpis\?\.(\w+)/g)].map((m) => m[1]))];
  if (bound.length === 0) {
    problems.push("SafetyKpiRow binds no kpis?.* fields — the tile/API binding check cannot run");
  }
  // A field counts as returned only when it is a key of the handler's `return { ... }` literal.
  // Scanning the whole handler is NOT equivalent: the query's generic type argument declares the
  // same names (`active_drivers: number;`), so a deleted return key would still look present.
  const returned = new Set([...returnedKeys(code).matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]));
  // pending_acknowledgments / pending_acks are interchangeable (the component falls back).
  const ackAliases = new Set(["pending_acknowledgments", "pending_acks"]);
  const ackSatisfied = [...ackAliases].some((a) => returned.has(a));
  for (const field of bound) {
    if (ackAliases.has(field) ? !ackSatisfied : !returned.has(field)) {
      problems.push(
        `SafetyKpiRow renders a tile bound to \`${field}\`, but the KPI endpoint never returns it — ` +
          `it resolves \`undefined ?? 0\` and the tile is permanently 0`
      );
    }
  }

  // 2. The stub view must not feed the dashboard.
  if (/views\.safety_dashboard_kpis/.test(code)) {
    problems.push(
      "KPI handler reads views.safety_dashboard_kpis — migration 0045 installs that view as a " +
        "`WHERE false` stub, so it returns zero rows on prod and every KPI renders 0"
    );
  }

  // 3. The phantom column must not come back.
  // Scoped per FROM-segment: acknowledgment_uuid is legitimate against
  // views.liabilities_active_with_context and illegitimate against the base table, and the two
  // subqueries sit adjacent. A proximity regex spans from one into the other and false-positives,
  // so compare each FROM-target against only the text that belongs to it.
  const phantomAck = code
    .split(/FROM\s+/)
    .slice(1)
    .some((seg) => /^driver_finance\.driver_liabilities\b/.test(seg.trim()) && /acknowledgment_uuid/.test(seg));
  if (phantomAck) {
    problems.push(
      "KPI handler selects acknowledgment_uuid FROM driver_finance.driver_liabilities — that column " +
        "does not exist on the table (use views.liabilities_active_with_context); the query throws"
    );
  }

  // 4. No silent zero-fallback on the KPI aggregate.
  if (/\.catch\(\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/.test(code)) {
    problems.push(
      "KPI aggregate uses `.catch(() => ({ rows: [] }))` — a failed query then renders identically " +
        "to a real all-clear on a safety screen. Let it fail loudly instead"
    );
  }

  return problems;
}

if (SELFTEST) {
  const live = { route: read(ROUTE), component: read(COMPONENT) };
  const failures = [];

  const expectCaught = (name, mutated, expect) => {
    const changed =
      mutated.route !== live.route || mutated.component !== live.component;
    if (!changed) {
      failures.push(`${name}: mutation did not change the source — the case is inert`);
      return;
    }
    const problems = assertKpisWired(mutated);
    if (!problems.some((p) => p.includes(expect))) {
      failures.push(
        `${name}: planted defect was NOT caught (expected a problem containing "${expect}", got: ${
          problems.length ? problems.join(" | ") : "no problems"
        })`
      );
    }
  };

  // Case 1: the API stops returning a field the component binds.
  // Target the RETURN key specifically. A bare /^\s*active_drivers:.*$/m matches the query's
  // generic type declaration first (it appears earlier), which would leave the return key intact
  // and make this case inert.
  expectCaught(
    "unbound-tile",
    { ...live, route: live.route.replace(/^\s*active_drivers: Number\(.*$/m, "") },
    "active_drivers"
  );

  // Case 2: the handler goes back to the stub view.
  expectCaught(
    "stub-view",
    {
      ...live,
      route: live.route.replace(
        "FROM safety.safety_events\n              WHERE operating_company_id = $1::uuid AND status = 'open'",
        "FROM views.safety_dashboard_kpis WHERE operating_company_id = $1::uuid"
      ),
    },
    "views.safety_dashboard_kpis"
  );

  // Case 3: the phantom column returns.
  expectCaught(
    "phantom-column",
    {
      ...live,
      route: live.route.replace(
        "FROM views.liabilities_active_with_context",
        "FROM driver_finance.driver_liabilities"
      ),
    },
    "acknowledgment_uuid"
  );

  // Case 4: a silent zero-fallback is reintroduced on the aggregate.
  expectCaught(
    "silent-catch",
    {
      ...live,
      route: live.route.replace(
        "        [companyId]\n      );\n      const testsRes",
        "        [companyId]\n      ).catch(() => ({ rows: [] }));\n      const testsRes"
      ),
    },
    "renders identically"
  );

  // The live tree must be clean.
  const liveProblems = assertKpisWired(live);
  if (liveProblems.length) {
    failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertKpisWired();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — every Safety KPI tile is bound to a field the endpoint really returns`);

#!/usr/bin/env node
/**
 * HOME-attention-maintenance guard — Home WO count surfaces must exclude voided rows (void-not-delete).
 *
 * Prod defect (2026-07-29 / #3755 / #4012): maintenance.work_orders held two voided demo rows
 * (DEMO-WO-001/002). Maintenance Active WOs correctly showed 0, but Home reported "WOS OPEN: 2" and
 * the attention widget counted voided rows as live critical/overdue PM work.
 *
 * Locks BOTH operator-facing Home paths:
 *   (1) GET /api/v1/home/wos-open-count — must use openWorkOrderPredicate() or voided_at IS NULL
 *   (2) GET /api/v1/reports/home-attention-list — maintenance critical/overdue count must filter voided_at IS NULL
 *
 * --selftest exercises assertGuard() against inline fixtures (pre-fix vs post-fix).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-home-wo-voided-at";
const HOME_WIDGETS = "apps/backend/src/home/home-widgets.routes.ts";
const LIBRARY = "apps/backend/src/reports/library.routes.ts";

function sliceRoute(src, routePath) {
  let start = src.indexOf(`"${routePath}"`);
  if (start < 0) start = src.indexOf(`'${routePath}'`);
  if (start < 0) return "";
  const rest = src.slice(start);
  const end = rest.search(/\n  app\.(get|post)\(["']/);
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 6000);
}

function maintenanceAttentionBlock(src) {
  const route = sliceRoute(src, "/api/v1/reports/home-attention-list");
  const start = route.indexOf("maintenanceCriticalOrOverdue");
  if (start < 0) return "";
  const end = route.indexOf("items.push({", start);
  return end > start ? route.slice(start, end) : route.slice(start, 2500);
}

export function assertGuard({ librarySrc, homeWidgetsSrc }) {
  const errors = [];

  const wosBlock = sliceRoute(homeWidgetsSrc, "/api/v1/home/wos-open-count");
  if (!wosBlock) {
    errors.push(`${HOME_WIDGETS}: /api/v1/home/wos-open-count route not found`);
  } else if (!/maintenance\.work_orders/.test(wosBlock)) {
    errors.push(`${HOME_WIDGETS}: wos-open-count must read maintenance.work_orders`);
  } else if (!/openWorkOrderPredicate\s*\(/.test(wosBlock) && !/voided_at\s+IS\s+NULL/i.test(wosBlock)) {
    errors.push(
      `${HOME_WIDGETS}: wos-open-count counts voided WOs — must use openWorkOrderPredicate() or voided_at IS NULL`
    );
  }

  const maintBlock = maintenanceAttentionBlock(librarySrc);
  if (!maintBlock) {
    errors.push(`${LIBRARY}: home-attention-list maintenanceCriticalOrOverdue block not found`);
  } else if (!/maintenance\.work_orders/.test(maintBlock)) {
    errors.push(`${LIBRARY}: attention list must count maintenance.work_orders`);
  } else if (!/voided_at\s+IS\s+NULL/i.test(maintBlock)) {
    errors.push(
      `${LIBRARY}: home-attention maintenance count omits voided_at IS NULL — voided demo WOs inflate Home attention`
    );
  }

  return errors;
}

function selftest() {
  const goodLibrary = `
    app.get("/api/v1/reports/home-attention-list", async () => {
    let maintenanceCriticalOrOverdue = 0;
    if (await relationExists(client, "maintenance.work_orders")) {
      const res = await client.query(\`
        SELECT count(*)::text AS total
        FROM maintenance.work_orders
        WHERE voided_at IS NULL
          AND \${whereParts.join(" AND ")}
      \`);
    }
    });
  `;
  const goodHome = `
    app.get("/api/v1/home/wos-open-count", async () => {
      const res = await client.query(\`
        SELECT count(*) FILTER (WHERE \${openWorkOrderPredicate()})::text AS open
        FROM maintenance.work_orders
        WHERE operating_company_id = $1::uuid
      \`);
    });
  `;
  const badLibrary = goodLibrary.replace("voided_at IS NULL\n          AND", "");
  const badHome = goodHome.replace("openWorkOrderPredicate()", "status IN ('open','in_progress')");

  const cases = [
    { n: "canonical both surfaces", library: goodLibrary, home: goodHome, want: 0 },
    { n: "library missing void filter", library: badLibrary, home: goodHome, min: 1 },
    { n: "wos-open-count missing void filter", library: goodLibrary, home: badHome, min: 1 },
    { n: "both missing void filter", library: badLibrary, home: badHome, min: 2 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard({ librarySrc: c.library, homeWidgetsSrc: c.home }).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const libraryPath = path.join(ROOT, LIBRARY);
const homePath = path.join(ROOT, HOME_WIDGETS);
if (!fs.existsSync(libraryPath)) {
  console.error(`[${LABEL}] FAILED — missing ${LIBRARY}`);
  process.exit(1);
}
if (!fs.existsSync(homePath)) {
  console.error(`[${LABEL}] FAILED — missing ${HOME_WIDGETS}`);
  process.exit(1);
}

const errors = assertGuard({
  librarySrc: fs.readFileSync(libraryPath, "utf8"),
  homeWidgetsSrc: fs.readFileSync(homePath, "utf8"),
});
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  `[${LABEL}] OK — Home wos-open-count + home-attention maintenance counts exclude voided work orders (matches Maintenance openWorkOrderPredicate).`
);

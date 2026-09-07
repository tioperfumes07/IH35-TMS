#!/usr/bin/env node
/**
 * verify-factoring-no-duplicate-kpi-band.mjs
 *
 * NEW-19 (owner 2026-09-07): "KPI boxes and factoring-profile view out of proportion; use the
 * shared KpiCard component." Live-verified root cause on the Reserve Tracker tab
 * (/factoring/reserve-tracker): FactoringHome.tsx renders a 6-tile DrillKpiCard summary band
 * (Active factor / Reserve balance / Outstanding Liability Balance / Advanced MTD / Recourse
 * days / Chargebacks & fees) ABOVE the tab content, then — only on the reserve_tracker tab —
 * also mounts ReserveTracker.tsx, which used to render its OWN 6-tile KpiStatCard band
 * (Submitted (batches) / Advances Received / FARO Reserve Held / Fees Paid YTD / Outstanding
 * Liability / Active Factor) covering nearly the same metrics from the SAME summary query
 * (["factoring","summary",companyId] in both files) — the same data, refetched under one
 * queryKey (TanStack dedupes it, so not a double network call) but painted TWICE in two
 * different card styles on one screen. That is exactly what read as "out of proportion."
 *
 * ReserveTracker.tsx mounts ONLY inside FactoringHome.tsx (no other importer) — confirmed via
 * `grep -rl "import.*ReserveTracker" apps/frontend/src` — so this guard can assert the
 * duplicate band's tiles never come back to that one file, without needing a live DOM walk.
 *
 * Usage:
 *   node scripts/verify-factoring-no-duplicate-kpi-band.mjs            # scan
 *   node scripts/verify-factoring-no-duplicate-kpi-band.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-no-duplicate-kpi-band";
const TRACKER = "apps/frontend/src/pages/factoring/ReserveTracker.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/** Exported for --selftest. */
export function checkNoDuplicateBand(src) {
  const failures = [];
  // The regression: any of the removed band's tile labels reappearing in ReserveTracker.tsx.
  const forbiddenLabels = [
    "Submitted (batches)",
    "Advances Received",
    "FARO Reserve Held",
    "Fees Paid YTD",
  ];
  for (const label of forbiddenLabels) {
    if (src.includes(`label="${label}"`) || src.includes(`label='${label}'`)) {
      failures.push(
        `${TRACKER}: NEW-19 regression — "${label}" KPI tile reintroduced (duplicates FactoringHome.tsx's own band).`,
      );
    }
  }
  // The regression: KpiStatCard reimported/reused here at all — this file has no legitimate
  // use for it once the duplicate band is gone (FactoringHome.tsx's DrillKpiCard band is the
  // only summary band on this tab).
  if (/from ["']\.\.\/\.\.\/components\/layout\/KpiStatCard["']/.test(src) || /<KpiStatCard\b/.test(src)) {
    failures.push(`${TRACKER}: NEW-19 regression — KpiStatCard reimported/used (the duplicate band is back).`);
  }
  return failures;
}

export function run() {
  const failures = [];
  const { ok, src, err } = read(TRACKER);
  if (!ok) {
    failures.push(err);
    return { ok: false, failures };
  }
  failures.push(...checkNoDuplicateBand(src));
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodSrc = `
    export function ReserveTracker() {
      return (
        <div className="space-y-4" data-testid="faro-reserve-tracker">
          {/* Release forecast */}
        </div>
      );
    }
  `;
  const badReintroducedLabel = goodSrc.replace(
    "{/* Release forecast */}",
    '<KpiStatCard label="Submitted (batches)" value="0" />\n          {/* Release forecast */}',
  );
  const badReintroducedImport = `import { KpiStatCard } from "../../components/layout/KpiStatCard";\n${goodSrc}`;

  const checks = [
    ["clean source passes", checkNoDuplicateBand(goodSrc).length === 0],
    ["reintroduced tile label fails", checkNoDuplicateBand(badReintroducedLabel).length > 0],
    ["reintroduced KpiStatCard import fails", checkNoDuplicateBand(badReintroducedImport).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — ReserveTracker.tsx has no duplicate KPI band (NEW-19)`);
process.exit(0);

#!/usr/bin/env node
/**
 * DISPATCH KPI TREATMENT (owner ruling 2026-09-04): "ALL KPI BOXES ... CENTERED" and KPI cards must
 * be a light tile with a darker border — not white-on-white. The dispatch overview KpiCard rendered
 * left-aligned on a plain bg-white with the faint cardBorder. This guard fails if the KpiCard style
 * drops centered text, the light kpiTileBg, or the darker kpiTileBorder — or if bg-white creeps back
 * onto the tile (which would paint over the light-tile token).
 *
 * Self-testing static guard. Run: node scripts/verify-dispatch-kpi-centered-light.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";
const original = fs.readFileSync(file, "utf8");

// Isolate the KpiCard style block so we don't match unrelated cards elsewhere in the file.
const styleBlock = (() => {
  const start = original.indexOf("const style: CSSProperties = {");
  return start === -1 ? "" : original.slice(start, start + 320);
})();

const contracts = [
  [
    "KpiCard tile uses the darker kpiTileBorder (not the faint cardBorder)",
    () => /border: `1px solid \$\{colors\.kpiTileBorder\}`/.test(styleBlock),
    (s) => s.replace("border: `1px solid ${colors.kpiTileBorder}`", "border: `1px solid ${colors.cardBorder}`"),
  ],
  [
    "KpiCard tile uses the light kpiTileBg (not white-on-white)",
    () => /backgroundColor: colors\.kpiTileBg/.test(styleBlock),
    (s) => s.replace("backgroundColor: colors.kpiTileBg,", ""),
  ],
  [
    "KpiCard content is centered (textAlign: center)",
    () => /textAlign: "center"/.test(styleBlock),
    (s) => s.replace('textAlign: "center",', ""),
  ],
  [
    "KpiCard tile no longer paints bg-white over the light tile",
    (s) => !/data-testid=\{testId\}[^>]*className="[^"]*bg-white/.test(s) && !/className="block bg-white transition/.test(s) && !/className="cursor-not-allowed bg-white"/.test(s),
    (s) => s.replace('className="block transition hover:shadow-xs"', 'className="block bg-white transition hover:shadow-xs"'),
  ],
];

function audit(s) {
  const block = (() => {
    const start = s.indexOf("const style: CSSProperties = {");
    return start === -1 ? "" : s.slice(start, start + 320);
  })();
  return contracts
    .filter(([, test]) => !test(s, block))
    .map(([name]) => name);
}

// The first three contracts read the module-level styleBlock closure; re-evaluate against a passed
// block for mutation testing.
function auditWith(s) {
  const start = s.indexOf("const style: CSSProperties = {");
  const block = start === -1 ? "" : s.slice(start, start + 320);
  const failing = [];
  if (!/border: `1px solid \$\{colors\.kpiTileBorder\}`/.test(block)) failing.push(contracts[0][0]);
  if (!/backgroundColor: colors\.kpiTileBg/.test(block)) failing.push(contracts[1][0]);
  if (!/textAlign: "center"/.test(block)) failing.push(contracts[2][0]);
  if (
    /className="block bg-white transition/.test(s) ||
    /className="cursor-not-allowed bg-white"/.test(s)
  )
    failing.push(contracts[3][0]);
  return failing;
}

const failures = auditWith(original);
if (failures.length) {
  console.error(`[verify-dispatch-kpi-centered-light] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    if (auditWith(mutate(original)).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-dispatch-kpi-centered-light] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-dispatch-kpi-centered-light] OK");

#!/usr/bin/env node
// verify-recon-collector-wired (D-#1 RECON-COLLECTOR)
//
// The QBO remote-count collector feeds accounting.qbo_remote_counts, which the reconciliation worker
// compares against TMS mirror counts. That feed froze on 2026-06-03 and nothing failed loudly. The
// investigation proved the SERVICE and CRON were built and correct — so the regression this guard must
// make impossible is the quiet un-wiring of an already-correct component:
//
//   1. the collector cron module still schedules BOTH ticks (delta + daily full);
//   2. index.ts still IMPORTS *and* INVOKES initializeQboRemoteCountCollectorCron
//      (an import alone is not wiring — the bug class is a call site silently dropped in a refactor);
//   3. the collector remains ON by default (opt-OUT), never opt-IN — a reconciliation control that
//      must be explicitly enabled is a control that will be forgotten;
//   4. the cron passes the FULL entity-type set, not a hand-picked subset. Prod holds rows for exactly
//      one of five entity types (qbo_vendors); a narrowed entity list must never be reintroduced.
//
// This is an availability control for a financial reconciliation feed. Per Rule #0 there are no silent
// failures: if any of the four invariants is removed, CI goes red.
//
// Self-test: --selftest (proves the guard FAILS on each planted regression).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CRON = "apps/backend/src/cron/qbo-remote-count-collector.cron.ts";
const INDEX = "apps/backend/src/index.ts";
const COLLECTOR = "apps/backend/src/integrations/qbo/remote-count-collector.ts";

const INIT_FN = "initializeQboRemoteCountCollectorCron";
const FLAG = "QBO_REMOTE_COUNT_COLLECTOR_ENABLED";

// The five master-data entity types the reconciliation worker compares. Additive: a new type may be
// appended, but none of these may be dropped from the collector's spec table.
const REQUIRED_ENTITY_TYPES = ["qbo_accounts", "qbo_classes", "qbo_items", "qbo_customers", "qbo_vendors"];

function read(rel, failures) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    failures.push(`missing file: ${rel}`);
    return "";
  }
}

/**
 * @param {{cron?: string, index?: string, collector?: string}} [override] injected sources (self-test only)
 * @returns {string[]} failures
 */
export function run(override) {
  const failures = [];

  const cron = override?.cron ?? read(CRON, failures);
  const index = override?.index ?? read(INDEX, failures);
  const collector = override?.collector ?? read(COLLECTOR, failures);

  // 1. BOTH schedules must survive. The delta tick is what keeps the feed inside the 25h staleness
  //    threshold the reconciliation worker asserts against; the full tick is the daily backstop.
  if (cron) {
    const scheduleCount = (cron.match(/cron\.schedule\s*\(/g) ?? []).length;
    if (scheduleCount < 2) {
      failures.push(
        `${CRON}: expected 2 cron.schedule() calls (delta + full), found ${scheduleCount} — a dropped schedule silently widens the feed gap`
      );
    }
    if (!/runMode/.test(cron) || !/"delta"/.test(cron) || !/"full"/.test(cron)) {
      failures.push(`${CRON}: must still run BOTH modes ("delta" and "full")`);
    }
  }

  // 2. Wiring: imported AND invoked. An import with no call site is the exact shape of a refactor that
  //    silently disables a background job while leaving every grep for the symbol satisfied.
  if (index) {
    const imported = new RegExp(`import\\s*\\{[^}]*\\b${INIT_FN}\\b[^}]*\\}`).test(index);
    // A call site is the function name followed by "(" that is NOT part of the import statement.
    const invoked = new RegExp(`(?<!import[^;]{0,400})\\b${INIT_FN}\\s*\\(`, "s").test(index)
      || index.split("\n").some((l) => new RegExp(`^\\s*${INIT_FN}\\s*\\(`).test(l));
    if (!imported) failures.push(`${INDEX}: ${INIT_FN} is not imported — collector cron cannot be wired`);
    if (!invoked) {
      failures.push(
        `${INDEX}: ${INIT_FN} is imported but never INVOKED — the reconciliation feed would never run (import is not wiring)`
      );
    }
  }

  // 3. Default-ON. Opt-in monitoring is monitoring nobody turns on.
  if (cron) {
    const defaultOn = new RegExp(`process\\.env\\.${FLAG}\\s*\\?\\?\\s*["']true["']`).test(cron);
    if (!defaultOn) {
      failures.push(
        `${CRON}: ${FLAG} must default to "true" (opt-OUT). An opt-IN reconciliation feed is a control that will never be enabled.`
      );
    }
  }

  // 4. Full entity coverage. Prod proved the failure mode: rows for 1 of 5 entity types.
  if (collector) {
    for (const t of REQUIRED_ENTITY_TYPES) {
      if (!collector.includes(`"${t}"`)) {
        failures.push(`${COLLECTOR}: entity type ${t} missing from the collector spec table — feed coverage narrowed`);
      }
    }
  }
  if (cron && !/qboRemoteCountEntityTypes\s*\(\s*\)/.test(cron)) {
    failures.push(
      `${CRON}: must collect the FULL entity set via qboRemoteCountEntityTypes() — a hand-picked subset reintroduces the vendors-only gap seen on prod`
    );
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Self-test: a guard that has never been proven to fail is not a guard.
function selftest() {
  const good = {
    cron:
      `if ((process.env.${FLAG} ?? "true").trim() === "false") { return; }\n` +
      `cron.schedule("10 */6 * * *", async () => { await runCollectorTick(app, "delta"); });\n` +
      `cron.schedule("20 2 * * *", async () => { await runCollectorTick(app, "full"); });\n` +
      `const r = await collect(id, { runMode, entityTypes: qboRemoteCountEntityTypes() });\n`,
    index: `import { ${INIT_FN} } from "./cron/qbo-remote-count-collector.cron.js";\n    ${INIT_FN}(app);\n`,
    collector: REQUIRED_ENTITY_TYPES.map((t) => `{ entityType: "${t}" }`).join(",\n"),
  };

  const cases = [
    ["baseline (correct wiring)", good, 0],
    ["import present, call site dropped", { ...good, index: `import { ${INIT_FN} } from "./x.js";\n` }, 1],
    ["one schedule removed", { ...good, cron: good.cron.replace(/cron\.schedule\("20 2 \* \* \*".*\n/, "") }, 1],
    ["flag flipped to opt-in", { ...good, cron: good.cron.replace(`?? "true"`, `?? "false"`) }, 1],
    ["entity type dropped", { ...good, collector: good.collector.replace(`{ entityType: "qbo_accounts" },\n`, "") }, 1],
    ["hand-picked entity subset in cron", { ...good, cron: good.cron.replace("qboRemoteCountEntityTypes()", `["qbo_vendors"]`) }, 1],
  ];

  let bad = 0;
  for (const [name, srcs, minFailures] of cases) {
    const got = run(srcs);
    const ok = minFailures === 0 ? got.length === 0 : got.length >= minFailures;
    if (!ok) {
      bad += 1;
      console.error(`  ✗ selftest "${name}": expected ${minFailures === 0 ? "no" : ">=" + minFailures} failure(s), got ${got.length}`);
      for (const f of got) console.error(`      ${f}`);
    } else {
      console.log(`  ✓ selftest "${name}"`);
    }
  }
  if (bad > 0) {
    console.error("verify:recon-collector-wired SELFTEST FAILED");
    process.exit(1);
  }
  console.log("verify:recon-collector-wired SELFTEST PASS (guard proven to fail on every planted regression)");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const failures = run();
    if (failures.length) {
      console.error("verify:recon-collector-wired FAIL — the QBO remote-count reconciliation feed is not fully wired:");
      for (const f of failures) console.error("  ✗ " + f);
      process.exit(1);
    }
    console.log("verify:recon-collector-wired PASS (cron scheduled ×2, wired in index.ts, default-ON, all 5 entity types)");
  }
}

#!/usr/bin/env node
/**
 * Matrix Option A ribbon — mutually exclusive tier tally must sum to required.
 * Mirrors apps/backend/src/program/matrix-metrics-tally.ts (keep in sync).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-matrix-metrics-tally";
const SELFTEST = process.argv.includes("--selftest");
const TALLY_TS = path.join(ROOT, "apps/backend/src/program/matrix-metrics-tally.ts");
const MATRIX_SVC = path.join(ROOT, "apps/backend/src/program/module-matrix.service.ts");
const SYSTEM_VIEW = path.join(ROOT, "apps/frontend/src/pages/program/ModuleMatrixSystemView.tsx");
const PREVIEW = path.join(ROOT, "apps/frontend/src/pages/program/ModuleMatrixPreviewPage.tsx");
const CATALOG = path.join(ROOT, "apps/frontend/src/pages/program/moduleMatrixCatalog.ts");

export function emptyTierBucket() {
  return {
    requiredCells: 0,
    liveCells: 0,
    builtOnlyCells: 0,
    probeOnlyCells: 0,
    auditedOnlyCells: 0,
    unauditedCells: 0,
  };
}

export function matrixPct(numerator, denominator) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function classifyMatrixCellTier(input) {
  if (!input.required) return "na";
  if (input.live) return "live";
  if (input.built) return "built";
  if (input.probeReason) return "probe";
  if (input.audited) return "audited";
  return "unaudited";
}

export function cellEmptyWhy(input) {
  if (!input.required) return undefined;
  if (input.live) return undefined;
  if (input.built) return "built_unproven";
  return "not_built";
}

export function cellQueueKind(why) {
  if (why === "not_built") return "fix";
  if (why === "built_unproven") return "errand";
  return undefined;
}

export function accumulateTierBucket(bucket, tier) {
  if (tier === "na") return;
  bucket.requiredCells += 1;
  switch (tier) {
    case "live":
      bucket.liveCells += 1;
      break;
    case "built":
      bucket.builtOnlyCells += 1;
      break;
    case "probe":
      bucket.probeOnlyCells += 1;
      break;
    case "audited":
      bucket.auditedOnlyCells += 1;
      break;
    default:
      bucket.unauditedCells += 1;
  }
}

export function finalizeTierMetrics(bucket) {
  const { requiredCells } = bucket;
  const livePct = matrixPct(bucket.liveCells, requiredCells);
  return {
    ...bucket,
    builtCells: bucket.builtOnlyCells + bucket.liveCells,
    auditedCells: bucket.auditedOnlyCells + bucket.probeOnlyCells,
    buildQueue: requiredCells - bucket.liveCells,
    requiredPct: requiredCells === 0 ? 0 : 100,
    auditedOnlyPct: matrixPct(bucket.auditedOnlyCells, requiredCells),
    probeOnlyPct: matrixPct(bucket.probeOnlyCells, requiredCells),
    builtOnlyPct: matrixPct(bucket.builtOnlyCells, requiredCells),
    livePct,
    certifiedPct: livePct,
    modulePct: livePct,
  };
}

export function assertTierTallyConsistent(bucket, label = "matrix") {
  const sum =
    bucket.liveCells +
    bucket.builtOnlyCells +
    bucket.probeOnlyCells +
    bucket.auditedOnlyCells +
    bucket.unauditedCells;
  if (sum !== bucket.requiredCells) {
    return [
      `${label} tier tally mismatch: ${sum} !== required ${bucket.requiredCells}`,
    ];
  }
  return [];
}

export function simulateBoard(cells) {
  const bucket = emptyTierBucket();
  for (const cell of cells) {
    const tier = classifyMatrixCellTier(cell);
    accumulateTierBucket(bucket, tier);
  }
  return finalizeTierMetrics(bucket);
}

export function matrixPreviewRecentProblems(preview) {
  const problems = [];
  if (!/module-matrix-recent-activity/.test(preview)) {
    problems.push("ModuleMatrixPreviewPage must show last-10 merged PRs (module-matrix-recent-activity)");
  }
  if (!/<h1 className="t">/.test(preview)) {
    problems.push("ModuleMatrixPreviewPage page title must be <h1 className=\"t\"> (COMPLICATED-BATTERY-F10 — first heading was Recent activity)");
  }
  const h1At = preview.indexOf("<h1 className=\"t\">");
  const recentAt = preview.indexOf("module-matrix-recent-activity");
  if (h1At < 0 || recentAt < 0 || h1At > recentAt) {
    problems.push("page <h1> must precede module-matrix-recent-activity so ?module=accounting is not read as a PR list");
  }
  if (!/resolveApiUrl\(\s*[`'"]\/api\/v1\/program\/audit-scoreboard/.test(preview)) {
    problems.push("matrix last-10 feed must fetch resolveApiUrl(\"/api/v1/program/audit-scoreboard\")");
  }
  if (!/mergedAtCt/.test(preview) || !/America\/Chicago/.test(preview)) {
    problems.push("matrix last-10 must display merge times in CT (America/Chicago mergedAtCt)");
  }
  if (!/slice\(0,\s*10\)/.test(preview)) {
    problems.push("matrix last-10 must cap recentActivity at 10 rows");
  }
  return problems;
}

function matrixPreviewEmptyWhyProblems(preview) {
  const problems = [];
  if (!/module-matrix-empty-why-legend/.test(preview) || !/not_built = FIX/.test(preview) || !/built_unproven = ERRAND/.test(preview)) {
    problems.push("module matrix must label empty cells not_built=FIX vs built_unproven=ERRAND (T-03 work queue)");
  }
  if (!/emptyWhyTitle\(st\)/.test(preview)) {
    problems.push("module matrix leaf cells must tooltip emptyWhyTitle (not_built vs built_unproven)");
  }
  return problems;
}

export function missCLiveProblems(svc) {
  const problems = [];
  if (!/opsReq - opsLive/.test(svc) || !/sysFrozenOps - sysOpsLive/.test(svc)) {
    problems.push("Miss C must be frozen minus Live (opsLive / sysOpsLive), not frozen minus Clicked");
  }
  return problems;
}

export function fwLiveFourthProblems(view) {
  const problems = [];
  if (!/4th ✓ = Box 4 Live/.test(view)) {
    problems.push("system matrix must set Fully-Wired 1–11 4th box = Box 4 Live (not Clicked)");
  }
  if (
    !/revrec/.test(view) ||
    !/invoice\+evidence/.test(view) ||
    !/bank-path/.test(view) ||
    !/real fuel/.test(view) ||
    !/factoring advance/.test(view)
  ) {
    problems.push("system matrix must name the five scenario events so they cannot be forgotten");
  }
  if (!/accounting → banking → settlements → factoring → dispatch → vendors/.test(view)) {
    problems.push("system matrix Urgent 6 must be accounting banking settlements factoring dispatch vendors");
  }
  if (!/vertically by column/.test(view)) {
    problems.push("system matrix must keep Urgent leftover vertical by column");
  }
  if (!/not a 5th Box/.test(view) || !/not new Required\.json leaves/.test(view)) {
    problems.push("system matrix must refuse a 5th Box and refuse new Required.json leaves");
  }
  return problems;
}

export function missCStaleWorkProblems(view) {
  const problems = [];
  if (!/module-matrix-miss-c-stale-work/.test(view) || !/Clicked-only work does not lower Miss C/.test(view)) {
    problems.push("system matrix must tell operators that Clicked-only merges do not lower Miss C");
  }
  return problems;
}

export function moneyParkProblems(svc, view) {
  const problems = [];
  if (/\(\s*group\s*\|\|\s*"other"\s*\)\s*!==\s*"money"/.test(svc) || /excludes money-group/.test(svc)) {
    problems.push("READY/Miss C must include money — isOpsReadyColumn must not exclude group money (owner 2026-08-20)");
  }
  if (svc.includes("function isOpsReadyColumn") && !/never park money/i.test(svc)) {
    problems.push("isOpsReadyColumn comment must say never park money");
  }
  if (/MONEY parked/.test(view) || /Miss C ignore MONEY/.test(view)) {
    problems.push("system matrix must not park money out of Frozen/Miss C/READY");
  }
  return problems;
}

export function exactSystemTrackerProblems(source) {
  const problems = [];
  if (!/const live = sys\.liveCells;/.test(source)) {
    problems.push("system tracker must use exact sys.liveCells, never reconstruct Live from rounded boxAbl percentages");
  }
  if (!/const builtCum = sys\.builtCells;/.test(source)) {
    problems.push("system tracker must use exact sys.builtCells, never reconstruct Built from rounded boxAbl percentages");
  }
  if (/Math\.round\(\(sys\.boxAbl\.(?:livePct|builtPct) \/ 100\) \* req\)/.test(source)) {
    problems.push("system tracker exact Built/Live counts must not be reconstructed from rounded percentages");
  }
  return problems;
}

function repoProblems() {
  const problems = [];
  if (!fs.existsSync(TALLY_TS)) problems.push(`MISSING ${TALLY_TS}`);
  if (!fs.existsSync(MATRIX_SVC)) problems.push(`MISSING ${MATRIX_SVC}`);
  else {
    const svc = fs.readFileSync(MATRIX_SVC, "utf8");
    if (!svc.includes("matrix-metrics-tally")) {
      problems.push("module-matrix.service.ts must import matrix-metrics-tally");
    }
    if (!svc.includes("groupRollups")) {
      problems.push("module-matrix.service.ts must expose groupRollups on payload");
    }
    if (!/SystemModuleMatrixPayload[\s\S]*groupRollups:\s*MatrixGroupRollup/.test(svc)) {
      problems.push("buildSystemModuleMatrix payload must include system groupRollups (parity with module boards)");
    }
    if (!svc.includes("assertTierTallyConsistent")) {
      problems.push("module-matrix.service.ts must assert tier tally before respond");
    }
    if (!svc.includes("classifyMatrixCellTier")) {
      problems.push("module-matrix.service.ts must classify cells with classifyMatrixCellTier");
    }
    if (!svc.includes("closedCells")) {
      problems.push("module-matrix.service.ts must expose closedCells (explicit leaf:col, not Box 4 fan-out)");
    }
    if (!svc.includes("FULLY_WIRED_MATRIX_ITEMS")) {
      problems.push("module-matrix.service.ts must roll up Fully-Wired 1–12 from Built/closed");
    }
    if (/fwAbl\[spec\.id\] = ablFromCounts\(req, aud, bu, 0\)/.test(svc) || /fwCounts\[spec\.id\] = \{ req, aud, bu, li: 0 \}/.test(svc)) {
      problems.push("FW 1–11 4th box must not hardcode livePct 0");
    }
    if (/fwAbl\[spec\.id\] = ablFromCounts\(req, aud, bu, ck\)/.test(svc) || /li: ck/.test(svc)) {
      problems.push("FW 1–11 4th box must use Live (c.li), not Clicked (ck) — Clicked 100% must not paint Fully-Wired launch");
    }
    if (!svc.includes("li += c.li")) {
      problems.push("FW 1–11 must sum per-column Live (c.li) into the 4th box");
    }
    if (!svc.includes("cellEmptyWhy") || !svc.includes("emptyWhy") || !svc.includes("queueKind")) {
      problems.push("module-matrix.service.ts must emit emptyWhy+queueKind (not_built=fix vs built_unproven=errand)");
    }
    if (!/clickedCells/.test(svc)) {
      problems.push("module-matrix.service.ts must expose clickedCells (Chrome click, not Box 4)");
    }
    if (!/bu: mClicked, li: mClicked/.test(svc) || /bu: 0, li: mClicked/.test(svc)) {
      problems.push("fw12 Clicked rollup must set Built=Clicked (never bu:0 which paints Built always red)");
    }
    if (!/frozenOps/.test(svc) || !/readyAbl/.test(svc) || !/isOpsReadyColumn/.test(svc)) {
      problems.push("module-matrix.service.ts must expose frozen READY (all Required cells including money)");
    }
    problems.push(...missCLiveProblems(svc));
    if (/\(\s*group\s*\|\|\s*"other"\s*\)\s*!==\s*"money"/.test(svc) || /excludes money-group/.test(svc)) {
      problems.push("READY/Miss C must include money — isOpsReadyColumn must not exclude group money (owner 2026-08-20)");
    }
    if (!/never park money/i.test(svc)) {
      problems.push("isOpsReadyColumn comment must say never park money");
    }
    if (!svc.includes("parseOutboxClickedKeys") || !svc.includes("GITHUB_OUTBOX_CONTENTS")) {
      problems.push("module-matrix.service.ts must parse OUTBOX Clicked and fetch origin/main via GitHub (docs/** deploy ignore)");
    }
    if (/raw\.slice\(0,\s*GITHUB_OUTBOX_HEAD_BYTES\)/.test(svc) || /Range = `bytes=0-\$\{GITHUB_OUTBOX_HEAD_BYTES/.test(svc)) {
      problems.push("Clicked OUTBOX must parse the FULL file — 128KB head dropped ~3300 Devin LIVE PASS lines");
    }
    if (!/ledgerInflight/.test(svc)) {
      problems.push("module-matrix must single-flight ledger parse (public-repo hang)");
    }
    const devinLive = fs
      .readFileSync(path.join(ROOT, "docs/bus/OUTBOX-DEVIN.md"), "utf8")
      .split("\n")
      .filter((l) => /LIVE PASS/i.test(l)).length;
    if (devinLive < 3000) {
      problems.push(`OUTBOX-DEVIN.md must keep historical LIVE PASS lines (have ${devinLive}, need >=3000)`);
    }
    if (!/module=\(\[a-z0-9_-\]\+\)/.test(svc) && !svc.includes("module=([a-z0-9_-]+)")) {
      problems.push("module-matrix.service.ts must salvage Devin module= + leaf= LIVE PASS lines");
    }
  }
  if (!fs.existsSync(SYSTEM_VIEW)) problems.push(`MISSING ${SYSTEM_VIEW}`);
  else {
    const view = fs.readFileSync(SYSTEM_VIEW, "utf8");
    problems.push(...exactSystemTrackerProblems(view));
    if (!/Clicked/.test(view) || !/Named/.test(view) || !/Modals/.test(view) || !/READY/.test(view) || !/Miss C/.test(view)) {
      problems.push("ModuleMatrixSystemView must keep atoms and add Named + Leaves + Modals + Clicked + Frozen + Miss C + READY");
    }
    if (!/launch-ladder|module-matrix-launch-ladder/.test(view) || !/FAST-MERGE/.test(view) || !/Vertical COL/.test(view) || !/Certify/.test(view)) {
      problems.push("system matrix must show launch-ladder columns: Wave, Vertical COL, FAST-MERGE, FW 1–11, Live 12, Certify");
    }
    if (!/Urgent 6/.test(view) || !/URGENT_6_MODULE_IDS/.test(view)) {
      problems.push("system matrix must label Urgent 6 first (accounting→…→vendors), not Urgent 16 A–Z as NOW");
    }
    if (!/module-matrix-kpi-frozen/.test(view) || !/module-matrix-kpi-miss-c/.test(view)) {
      problems.push("system matrix must show Frozen and Miss C KPIs as opsClicked of frozenOps");
    }
    if (!/unpaid Live of frozen/.test(view) || !/ops Clicked of frozen cells/.test(view)) {
      problems.push("Frozen KPI = Clicked of frozen; Miss C KPI = unpaid Live of frozen (Clicked 100% must not zero Miss C)");
    }
    if (!/per-cell why \(not_built=FIX vs built_unproven=ERRAND\)/.test(view)) {
      problems.push("system matrix tooltip must send operators to module board for not_built vs built_unproven");
    }
    problems.push(...missCStaleWorkProblems(view));
    problems.push(...fwLiveFourthProblems(view));
    if (/MONEY parked/.test(view) || /Miss C ignore MONEY/.test(view)) {
      problems.push("system matrix must not park money out of Frozen/Miss C/READY");
    }
  }
  if (!fs.existsSync(PREVIEW)) problems.push(`MISSING ${PREVIEW}`);
  else {
    const previewSrc = fs.readFileSync(PREVIEW, "utf8");
    problems.push(...matrixPreviewRecentProblems(previewSrc));
    problems.push(...matrixPreviewEmptyWhyProblems(previewSrc));
  }
  if (!fs.existsSync(CATALOG)) problems.push(`MISSING ${CATALOG}`);
  else {
    const cat = fs.readFileSync(CATALOG, "utf8");
    if (!/export const URGENT_6_MODULE_IDS = launchLadder\.urgent_6/.test(cat)) {
      problems.push("moduleMatrixCatalog must export URGENT_6_MODULE_IDS from launch-ladder.json");
    }
    const ladderJson = fs.readFileSync(path.join(ROOT, "docs/specs/scoreboard/launch-ladder.json"), "utf8");
    if (!/"accounting"/.test(ladderJson) || !/"vendors"/.test(ladderJson) || !/"fast_merge"/.test(ladderJson)) {
      problems.push("launch-ladder.json must name Urgent 6 modules and FAST-MERGE");
    }
    const block = cat.match(/export const URGENT_16_MODULE_IDS[\s\S]*?\] as const/);
    if (!block) {
      problems.push("moduleMatrixCatalog must export URGENT_16_MODULE_IDS");
    } else {
      const ids = [...block[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      const expected = [
        "accounting",
        "banking",
        "cash-flow",
        "customers",
        "dispatch",
        "drivers",
        "factoring",
        "finance",
        "fleet",
        "insurance",
        "legal",
        "lists",
        "maintenance",
        "safety",
        "settlements",
        "vendors",
      ];
      if (ids.length !== 16 || JSON.stringify(ids) !== JSON.stringify(expected)) {
        problems.push("URGENT_16_MODULE_IDS must be exactly 16 modules in A–Z id order, including legal+finance");
      }
    }
  }
  return problems;
}

if (SELFTEST) {
  const m = simulateBoard([
    { required: true, live: false, built: false, probeReason: "x", audited: true },
    { required: true, live: false, built: true, audited: true },
    { required: true, live: true, built: true, audited: true },
    { required: true, live: false, built: false, audited: true },
    { required: true, live: false, built: false, audited: false },
  ]);
  if (m.requiredCells !== 5) {
    console.error(`${LABEL} selftest: expected 5 required got ${m.requiredCells}`);
    process.exit(1);
  }
  if (m.liveCells !== 1 || m.builtOnlyCells !== 1 || m.probeOnlyCells !== 1 || m.auditedOnlyCells !== 1) {
    console.error(`${LABEL} selftest: tier cell counts wrong`, m);
    process.exit(1);
  }
  if (m.certifiedPct !== m.livePct || m.certifiedPct !== 20) {
    console.error(`${LABEL} selftest: certified must equal livePct`, m);
    process.exit(1);
  }
  const bad = emptyTierBucket();
  bad.requiredCells = 3;
  bad.liveCells = 2;
  if (assertTierTallyConsistent(bad).length === 0) {
    console.error(`${LABEL} selftest: tally mismatch should fail`);
    process.exit(1);
  }
  const systemView = fs.readFileSync(SYSTEM_VIEW, "utf8");
  const plantedRoundedReconstruction = systemView.replace(
    "const live = sys.liveCells;",
    "const live = Math.round((sys.boxAbl.livePct / 100) * req);",
  );
  if (!exactSystemTrackerProblems(plantedRoundedReconstruction).some((p) => p.includes("exact sys.liveCells"))) {
    console.error(`${LABEL} selftest: rounded-percent tracker mutation escaped`);
    process.exit(1);
  }
  const plantedMoneyPark = fs
    .readFileSync(MATRIX_SVC, "utf8")
    .replace("never park money", "QBO books parked")
    .replace("return true;", 'return (group || "other") !== "money";');
  const parkedView = fs.readFileSync(SYSTEM_VIEW, "utf8").replace(
    "Frozen / Miss C include money.",
    "Frozen / Miss C ignore MONEY.",
  );
  if (
    !moneyParkProblems(plantedMoneyPark, parkedView).some((p) => p.includes("must include money")) ||
    !moneyParkProblems(plantedMoneyPark, parkedView).some((p) => p.includes("must not park money"))
  ) {
    console.error(`${LABEL} selftest: money-park mutation escaped`, moneyParkProblems(plantedMoneyPark, parkedView));
    process.exit(1);
  }
  const plantedMissClicked = fs
    .readFileSync(MATRIX_SVC, "utf8")
    .replaceAll("opsReq - opsLive", "opsReq - opsClicked")
    .replaceAll("sysFrozenOps - sysOpsLive", "sysFrozenOps - sysOpsClicked");
  if (/opsReq - opsLive/.test(plantedMissClicked) || /sysFrozenOps - sysOpsLive/.test(plantedMissClicked)) {
    console.error(`${LABEL} selftest: could not plant Clicked Miss C`);
    process.exit(1);
  }
  if (!/opsReq - opsClicked/.test(plantedMissClicked)) {
    console.error(`${LABEL} selftest: planted Miss C did not revert to Clicked`);
    process.exit(1);
  }
  if (!missCLiveProblems(plantedMissClicked).some((p) => p.includes("frozen minus Live"))) {
    console.error(`${LABEL} selftest: Miss C Clicked-zero mutation escaped`);
    process.exit(1);
  }
  const plantedStaleHint = systemView.replace("Clicked-only work does not lower Miss C", "merge always lowers Miss C");
  if (!missCStaleWorkProblems(plantedStaleHint).some((p) => p.includes("Clicked-only"))) {
    console.error(`${LABEL} selftest: Miss C stale-work hint mutation escaped`);
    process.exit(1);
  }
  const plantedFwClicked = systemView.replace("4th ✓ = Box 4 Live", "4th ✓ = Chrome Clicked");
  if (!fwLiveFourthProblems(plantedFwClicked).some((p) => p.includes("4th box = Box 4 Live"))) {
    console.error(`${LABEL} selftest: FW 1–11 Clicked-fourth mutation escaped`);
    process.exit(1);
  }
  const repo = repoProblems();
  if (repo.length) {
    console.error(`${LABEL} selftest repo wiring:`, repo);
    process.exit(1);
  }
  const previewLive = fs.readFileSync(PREVIEW, "utf8");
  const plantedNoRecent = previewLive.replace("module-matrix-recent-activity", "module-matrix-kpi-only");
  if (!matrixPreviewRecentProblems(plantedNoRecent).some((p) => p.includes("last-10 merged"))) {
    console.error(`${LABEL} selftest: last-10 strip mutation escaped`);
    process.exit(1);
  }
  const plantedNoEmptyWhy = previewLive.replace("module-matrix-empty-why-legend", "module-matrix-kpi-only");
  if (!matrixPreviewEmptyWhyProblems(plantedNoEmptyWhy).some((p) => p.includes("not_built=FIX"))) {
    console.error(`${LABEL} selftest: empty-why legend mutation escaped`);
    process.exit(1);
  }
  if (cellEmptyWhy({ required: true, built: false, live: false }) !== "not_built") {
    console.error(`${LABEL} selftest: not_built expected`);
    process.exit(1);
  }
  if (cellEmptyWhy({ required: true, built: true, live: false }) !== "built_unproven") {
    console.error(`${LABEL} selftest: built_unproven expected`);
    process.exit(1);
  }
  if (cellEmptyWhy({ required: true, built: true, live: true }) !== undefined) {
    console.error(`${LABEL} selftest: live cells must not queue`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
  process.exit(0);
}

const repo = repoProblems();
if (repo.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of repo) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Option A tier tally wired in matrix API`);
process.exit(0);

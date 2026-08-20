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
    if (!/clickedCells/.test(svc)) {
      problems.push("module-matrix.service.ts must expose clickedCells (Chrome click, not Box 4)");
    }
    if (!/frozenOps/.test(svc) || !/readyAbl/.test(svc) || !/isOpsReadyColumn/.test(svc)) {
      problems.push("module-matrix.service.ts must expose frozen ops READY (non-money, USMCA Clicked)");
    }
    if (!svc.includes("parseOutboxClickedKeys") || !svc.includes("GITHUB_OUTBOX_CONTENTS")) {
      problems.push("module-matrix.service.ts must parse OUTBOX Clicked and fetch origin/main via GitHub (docs/** deploy ignore)");
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
    if (!/Urgent 16/.test(view) || !/URGENT_16_MODULE_IDS/.test(view)) {
      problems.push("system matrix must label Urgent 16 A–Z (legal + finance included)");
    }
    if (!/module-matrix-kpi-frozen/.test(view) || !/module-matrix-kpi-miss-c/.test(view)) {
      problems.push("system matrix must show Frozen and Miss C KPIs as opsClicked of frozenOps");
    }
    if (!/ops Clicked of frozen cells/.test(view) || !/unpaid Clicked of frozen/.test(view)) {
      problems.push("Frozen/Miss C KPI labels must be X of frozen (not Box 4)");
    }
  }
  if (!fs.existsSync(PREVIEW)) problems.push(`MISSING ${PREVIEW}`);
  else problems.push(...matrixPreviewRecentProblems(fs.readFileSync(PREVIEW, "utf8")));
  if (!fs.existsSync(CATALOG)) problems.push(`MISSING ${CATALOG}`);
  else {
    const cat = fs.readFileSync(CATALOG, "utf8");
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

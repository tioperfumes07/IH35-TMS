#!/usr/bin/env node
/**
 * INVERTED — LEAD 443.192 (12:35Z), OWNER LAW: "Per-mile drivers are ALWAYS paid SHORT miles — never practical miles. Short
 * miles is the fixed pay basis, not a per-load choice." This guard now locks THAT rule in resolveDriverBasePayCents and the
 * bill writer: loaded pay = load.miles_shortest x the rate ONLY (no practical fallback, no card-configured practical basis),
 * the fresh-mint gate refuses without short miles, the bill's miles basis is never "practical"; and (kept) no formula derives
 * short miles from practical. Measured 2026-10-17 before the change: 8 open USMCA per-mile bills priced at practical miles.
 * LEAD 443.192 (13:25Z) item 1 — EXTENDED to the two settlement readers: batch-settlements.service.ts (batchPayMiles /
 * toLoadBlock: the miles the Settlement Creator prices batch pay with) and settlements.service.ts
 * (listDriverBillsForSettlementPeriod: the pay miles + derived rate the settlement document / weekly close display). Neither
 * may read miles_practical, nor mdata.loads.loaded_miles (derived: short > 0, else practical), nor take a bill basis whose
 * type is 'practical'. No short miles = null / refused, never a practical fallback.
 * The text below is the superseded 2026-09-04 history (the fallback it locked existed only because short miles had no source).
 *
 * OWNER RULING 2026-09-04 (LANE-MILEAGE-IMPORT-DROPPED-COLUMNS, item 3): "invoice -> practical
 * miles; driver pay -> short miles loaded + empty miles deadhead ... the practical fallback in
 * book-load.service.ts:498-500 is the ONLY correct loaded-pay path today. Keep it, document it as
 * the owner-ruled fallback, and guard it so it cannot be removed. DO NOT invent short miles from
 * practical by any formula."
 *
 * This guard locks resolveDriverBasePayCents's per_mile_pay branch in place:
 *   1. The exact fallback expression is present -- practical miles are used when the driver's rate
 *      card is explicitly configured miles_basis="practical_miles" OR when miles_shortest is
 *      missing/non-positive; otherwise miles_shortest is used. Neither condition is optional.
 *   2. No formula anywhere in this function derives/estimates a "short miles" value FROM
 *      miles_practical (e.g. a multiplier, a percentage, Math.min/Math.max blending the two) --
 *      the owner explicitly forbade deriving one from the other; the only two source values that
 *      may feed the loaded-pay `miles` variable are the raw load.miles_shortest and
 *      load.miles_practical columns, verbatim.
 *   3. The owner-ruling doc comment citing this exact rule survives (so a future refactor can't
 *      silently drop the fallback without a human noticing the comment explaining why it exists).
 *
 * Run: node scripts/verify-driver-pay-practical-fallback-locked.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/dispatch/book-load.service.ts";
const LABEL = "verify-driver-pay-practical-fallback-locked";
const BATCH = "apps/backend/src/driver-finance/batch-settlements.service.ts";
const SETTLE = "apps/backend/src/driver-finance/settlements.service.ts";

/** A top-level function's body (to the next top-level declaration), without its doc comment. */
function fnBody(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return null;
  const rest = src.slice(start + 1);
  const end = rest.search(/\n(?:export\s+)?(?:async\s+)?(?:function|const|let|class|interface|type)\s/);
  return src.slice(start, end === -1 ? src.length : start + 1 + end);
}

/** Code only: drop // and /* *\/ comments and SQL -- comment lines, so a history comment naming a column is not code. */
function codeOnly(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, "").replace(/--.*$/, ""))
    .join("\n");
}

/** LEAD 443.192 item 1 — batch pay miles and the settlement's displayed pay miles / derived rate are SHORT miles only. */
function checkSettlementReaders(root, problems) {
  let batch;
  try {
    batch = fs.readFileSync(path.join(root, BATCH), "utf8");
  } catch {
    problems.push(`${BATCH}: missing`);
    batch = null;
  }
  if (batch) {
    const payMiles = fnBody(batch, "export function batchPayMiles(");
    const block = fnBody(batch, "export function toLoadBlock(");
    if (!payMiles) problems.push(`${BATCH}: batchPayMiles (the one short-miles pay-miles rule for batch settlements) not found`);
    if (!block) problems.push(`${BATCH}: toLoadBlock not found`);
    if (payMiles) {
      const code = codeOnly(payMiles);
      if (/miles_practical|loaded_miles/.test(code)) {
        problems.push(`${BATCH}: batchPayMiles reads practical / derived loaded_miles — owner law (443.192): batch pay is SHORT miles only`);
      }
      if (!/load\.miles_shortest/.test(code)) problems.push(`${BATCH}: batchPayMiles must fall back to load.miles_shortest (and only that)`);
      if (!/bill_miles_basis_type\s*!==\s*"practical"/.test(code)) {
        problems.push(`${BATCH}: batchPayMiles must refuse a driver bill whose miles basis is 'practical'`);
      }
    }
    if (block) {
      const code = codeOnly(block);
      if (/load\.miles_practical|load\.loaded_miles/.test(code)) {
        problems.push(`${BATCH}: toLoadBlock feeds practical / derived loaded_miles into the settlement's pay miles — owner law (443.192)`);
      }
      if (!/const miles = batchPayMiles\(load\);/.test(code)) problems.push(`${BATCH}: toLoadBlock pay miles must be batchPayMiles(load), verbatim`);
      if (!/miles_shortest:\s*miles\b/.test(code)) problems.push(`${BATCH}: toLoadBlock must hand the creator miles_shortest = the short pay miles`);
    }
  }

  let settle;
  try {
    settle = fs.readFileSync(path.join(root, SETTLE), "utf8");
  } catch {
    problems.push(`${SETTLE}: missing`);
    return;
  }
  const list = fnBody(settle, "export async function listDriverBillsForSettlementPeriod(");
  if (!list) {
    problems.push(`${SETTLE}: listDriverBillsForSettlementPeriod not found`);
    return;
  }
  const code = codeOnly(list);
  if (/miles_practical/.test(code)) {
    problems.push(`${SETTLE}: listDriverBillsForSettlementPeriod reads miles_practical for the pay miles / derived rate — owner law (443.192): SHORT miles only`);
  }
  if (/'practical \(load\)'/.test(code)) problems.push(`${SETTLE}: the 'practical (load)' pay-miles label is gone for good (443.192)`);
  if (!/db\.miles_basis_type IS DISTINCT FROM 'practical'/.test(code)) {
    problems.push(`${SETTLE}: a driver bill whose own basis is 'practical' must not supply the displayed pay miles`);
  }
}

// LEAD 443.192 (13:25Z item 2) — the Settlement Creator: its pay miles and the miles it books a load with.
const CREATOR_PAY = "apps/backend/src/driver-finance/settlement-creator-empty-pay.ts";
const CREATOR_SEED = "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts";
const CREATOR_PREFLIGHT = "apps/backend/src/driver-finance/settlement-creator-preflight.ts";

/** 443.192 — Creator pay = SHORT miles only; the seed books document miles on miles_shortest only; neither field copies the other. */
export function creatorProblems(root = ROOT) {
  const problems = [];
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      problems.push(`${rel}: missing`);
      return null;
    }
  };
  const pay = read(CREATOR_PAY);
  const seed = read(CREATOR_SEED);
  const pre = read(CREATOR_PREFLIGHT);
  if (pay) {
    const fn = pay.slice(pay.indexOf("export function creatorPayMiles"), pay.indexOf("export function creatorPayMiles") + 400);
    if (!pay.includes("export function creatorPayMiles") || !/const miles = Number\(load\.miles_shortest \?\? NaN\);/.test(fn)) {
      problems.push(`${CREATOR_PAY}: creatorPayMiles must be load.miles_shortest ONLY (no loaded / practical fallback) — owner law 443.192`);
    }
    if (/creatorPayMiles[\s\S]{0,200}?miles_shortest\s*\?\?\s*load\.(loaded_miles|line_haul_miles|miles_practical)/.test(pay)) {
      problems.push(`${CREATOR_PAY}: Creator pay miles fall back from short to loaded / practical miles — owner law 443.192`);
    }
  }
  if (seed) {
    if (/miles_shortest:\s*load\.miles_shortest\s*\?\?/.test(seed) || /miles_shortest:\s*load\.(loaded_miles|line_haul_miles)/.test(seed)) {
      problems.push(`${CREATOR_SEED}: the seed books miles_shortest from a loaded / practical fallback — the document's pay miles only (443.192)`);
    }
    if (!/miles_shortest:\s*miles\.miles_shortest,/.test(seed) || !/miles_practical:\s*miles\.miles_practical,/.test(seed) || !/creatorLoadMiles\(load\)/.test(seed)) {
      problems.push(`${CREATOR_SEED}: the seed must book miles through creatorLoadMiles (short = the pay figure, practical = its own figure)`);
    }
    if (!/"short_miles_required"/.test(seed)) {
      problems.push(`${CREATOR_SEED}: a per-mile Creator load without short miles must be refused before booking (short_miles_required)`);
    }
  }
  if (pre) {
    if (!/CREATOR_SHORT_MILES_REQUIRED_MESSAGE/.test(pre)) {
      problems.push(`${CREATOR_PREFLIGHT}: the preview must name the missing SHORT (pay) miles (CREATOR_SHORT_MILES_REQUIRED_MESSAGE)`);
    }
    if (/Number\(l\.loaded_miles \?\? l\.line_haul_miles/.test(pre) && !/creatorLoadMiles\(l\)/.test(pre)) {
      problems.push(`${CREATOR_PREFLIGHT}: preview miles must come from creatorLoadMiles`);
    }
  }
  return problems;
}

function extractFunction(src) {
  const start = src.indexOf("async function resolveDriverBasePayCents");
  if (start === -1) return null;
  // The function body (to the next top-level declaration) plus its leading doc comment block.
  // 443.99: a fixed +4000-char window stopped short of the fallback once the function grew (salaried
  // override, 443.31 rate-card refusals) — bound it by the function's own end, never a byte count.
  const rest = src.slice(start + 1);
  const end = rest.search(/\n(?:export\s+)?(?:async\s+)?(?:function|const|let|class|interface|type)\s/);
  return src.slice(Math.max(0, start - 1600), end === -1 ? src.length : start + 1 + end);
}

export function run(root = ROOT) {
  const problems = [];
  let src;
  try {
    src = fs.readFileSync(path.join(root, SVC), "utf8");
  } catch {
    return [`${SVC}: missing`];
  }

  problems.push(...creatorProblems(root));
  const fn = extractFunction(src);
  if (!fn) {
    problems.push(`${SVC}: resolveDriverBasePayCents not found — was it renamed or removed?`);
    return problems;
  }

  // 1. (443.192) Loaded pay is SHORT miles only — the old practical fallback / practical card basis must be gone.
  if (/rate\.miles_basis\s*===\s*"practical_miles"/.test(fn) || /Number\(load\.miles_practical/.test(fn)) {
    problems.push(`${SVC}: resolveDriverBasePayCents prices loaded pay from practical miles — owner law (443.192): per-mile drivers are ALWAYS paid SHORT miles`);
  }
  if (!/const miles = Number\(load\.miles_shortest \?\? Number\.NaN\);/.test(fn)) {
    problems.push(`${SVC}: resolveDriverBasePayCents loaded miles must be load.miles_shortest, verbatim`);
  }
  if (!/const perLoadMiles = Number\(load\.miles_shortest \?\? Number\.NaN\);/.test(src)) {
    problems.push(`${SVC}: the per-load override rate must pay short miles too (perLoadMiles = miles_shortest)`);
  }
  if (!/const hasAnyRealMiles = Number\(load\.miles_shortest \?\? 0\) > 0;/.test(src)) {
    problems.push(`${SVC}: a fresh driver bill must be refused without SHORT miles (driver_bill.refused_no_shortest_miles)`);
  }
  if (/milesBasisType = "practical"/.test(src)) {
    problems.push(`${SVC}: a driver bill's miles basis can never be "practical"`);
  }

  // 2. No derivation formula for short-from-practical inside this function. A derivation would
  // look like assigning something computed FROM miles_practical into a variable that then feeds
  // the "short" side of the branch, or a multiplier/ratio applied to miles_practical anywhere in
  // this function's body.
  const derivationRe = /miles_practical[\s\S]{0,40}?[*/][\s\S]{0,20}?[0-9.]|miles_shortest\s*=\s*[\s\S]{0,60}?miles_practical/;
  if (derivationRe.test(fn)) {
    problems.push(
      `${SVC}: resolveDriverBasePayCents appears to derive short miles from practical miles by a formula — the owner explicitly forbade this ("Any formula would fabricate driver pay")`
    );
  }

  // 3. The owner-law comment survives.
  if (!/OWNER LAW \(LEAD 443\.192/.test(fn)) {
    problems.push(`${SVC}: the OWNER LAW (LEAD 443.192) comment on the short-miles pay rule is missing`);
  }

  checkSettlementReaders(root, problems);
  return problems;
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/driver-pay-short-miles-selftest-");
  const abs = path.join(dir, SVC);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const good = `
async function resolveDriverBasePayCents(client, operatingCompanyId, driverId, load, actorUserId) {
  if (rate.basis_type === "per_load_pay") {
    // ...
  } else {
    // OWNER LAW (LEAD 443.192, 12:35Z): short miles only.
    const miles = Number(load.miles_shortest ?? Number.NaN);
    cardCents = miles;
  }
  const perLoadMiles = Number(load.miles_shortest ?? Number.NaN);
}
async function createDriverBillArtifacts() {
  const hasAnyRealMiles = Number(load.miles_shortest ?? 0) > 0;
  if (milesShort && milesShort > 0) {
    milesBasis = milesShort;
    milesBasisType = "short";
  }
}
`;
  const goodBatch = `
export function batchPayMiles(load) {
  const hasBill = load.bill_loaded_pay_cents != null;
  const billBasis = Number(load.bill_miles_basis ?? Number.NaN);
  if (hasBill && billBasis > 0 && load.bill_miles_basis_type !== "practical") return billBasis;
  const short = Number(load.miles_shortest ?? Number.NaN);
  return short > 0 ? short : null;
}

export function toLoadBlock(load) {
  // history: used to be load.loaded_miles ?? load.miles_practical
  const miles = batchPayMiles(load);
  return { line_haul_miles: miles, loaded_miles: miles, miles_shortest: miles };
}
`;
  const goodSettle = `
export async function listDriverBillsForSettlementPeriod(client, input) {
  return client.query(\`
    -- bill 13577 miles_basis NULL -> mdata.loads.miles_practical 1435.9 (history comment, not code)
    CASE
      WHEN db.miles_basis IS NOT NULL AND db.miles_basis_type IS DISTINCT FROM 'practical' THEN db.miles_basis
      WHEN COALESCE(dbl.miles_shortest, 0) > 0 THEN dbl.miles_shortest
      ELSE NULL
    END AS miles_basis,
    ROUND(db.gross_amount_cents::numeric / NULLIF(dbl.miles_shortest, 0))::integer
  \`);
}

export function driverBillRowsToSettlementLoads(rows) { return rows; }
`;
  const batchAbs = path.join(dir, BATCH);
  const settleAbs = path.join(dir, SETTLE);
  fs.mkdirSync(path.dirname(batchAbs), { recursive: true });
  const creatorGood = {
    [CREATOR_PAY]: `export function creatorPayMiles(load) {
  const miles = Number(load.miles_shortest ?? NaN);
  return Number.isFinite(miles) && miles > 0 ? miles : null;
}`,
    [CREATOR_SEED]: `const miles = creatorLoadMiles(load);
if (miles.miles_shortest == null && !draft.salaried) throw new SettlementCreatorSeedError("short_miles_required", "x");
const input = {
  miles_practical: miles.miles_practical,
  miles_shortest: miles.miles_shortest,
};`,
    [CREATOR_PREFLIGHT]: `const miles = creatorLoadMiles(l);
if (miles.miles_shortest == null && !draft.salaried) out.push(CREATOR_SHORT_MILES_REQUIRED_MESSAGE);`,
  };
  const writeCreator = (over = {}) => {
    for (const [rel, body] of Object.entries({ ...creatorGood, ...over })) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), body);
    }
  };
  const check = (src, label, expectClean, batchSrc = goodBatch, settleSrc = goodSettle, creatorOver = {}) => {
    writeCreator(creatorOver);
    fs.writeFileSync(abs, src);
    fs.writeFileSync(batchAbs, batchSrc);
    fs.writeFileSync(settleAbs, settleSrc);
    const p = run(dir);
    if (expectClean ? p.length : !p.length) throw new Error(`${expectClean ? "PASS fail" : "FAIL to catch"}: ${label} ${JSON.stringify(p)}`);
  };
  check(good, "clean baseline", true);
  check(good.replace("const miles = Number(load.miles_shortest ?? Number.NaN);", 'const miles = rate.miles_basis === "practical_miles" || !(Number(load.miles_shortest ?? 0) > 0) ? Number(load.miles_practical ?? Number.NaN) : Number(load.miles_shortest ?? Number.NaN);'), "practical fallback back", false);
  check(good.replace("cardCents = miles;", "const derivedShort = load.miles_practical * 1.1;\n    cardCents = derivedShort;"), "short derived from practical", false);
  check(good.replace("const perLoadMiles = Number(load.miles_shortest ?? Number.NaN);", "const perLoadMiles = Number(load.miles_practical ?? Number.NaN);"), "override pays practical", false);
  check(good.replace("const hasAnyRealMiles = Number(load.miles_shortest ?? 0) > 0;", "const hasAnyRealMiles = Number(load.miles_shortest ?? 0) > 0 || Number(load.miles_practical ?? 0) > 0;"), "gate accepts practical-only", false);
  check(good.replace('milesBasisType = "short";\n  }', 'milesBasisType = "short";\n  } else { milesBasisType = "practical"; }'), "bill basis practical", false);
  check(good.replace("// OWNER LAW (LEAD 443.192, 12:35Z): short miles only.\n", ""), "owner-law comment dropped", false);
  // LEAD 443.192 item 1 — the two settlement readers.
  check(good, "batch: pay miles fall back to loaded_miles/practical (origin/main shape)", false,
    goodBatch.replace("const miles = batchPayMiles(load);", "const miles = load.bill_miles_basis ?? load.loaded_miles ?? load.miles_practical;"));
  check(good, "batch: batchPayMiles falls back to practical", false,
    goodBatch.replace("const short = Number(load.miles_shortest ?? Number.NaN);", "const short = Number(load.miles_shortest ?? load.miles_practical ?? Number.NaN);"));
  check(good, "batch: practical-basis bill accepted", false,
    goodBatch.replace(' && load.bill_miles_basis_type !== "practical"', ""));
  check(good, "batch: creator not handed short miles", false,
    goodBatch.replace(", miles_shortest: miles }", " }"));
  check(good, "settle: COALESCE(db.miles_basis, dbl.miles_practical, ...) (origin/main shape)", false, goodBatch,
    goodSettle.replace("WHEN COALESCE(dbl.miles_shortest, 0) > 0 THEN dbl.miles_shortest", "WHEN COALESCE(dbl.miles_practical, 0) > 0 THEN dbl.miles_practical"));
  check(good, "settle: rate divided by practical", false, goodBatch,
    goodSettle.replace("NULLIF(dbl.miles_shortest, 0)", "NULLIF(COALESCE(dbl.miles_practical, dbl.miles_shortest), 0)"));
  check(good, "settle: practical-basis bill displayed", false, goodBatch,
    goodSettle.replace(" AND db.miles_basis_type IS DISTINCT FROM 'practical'", ""));
  const cp = creatorGood[CREATOR_PAY];
  const cs = creatorGood[CREATOR_SEED];
  check(good, "Creator pay falls back to loaded miles", false, goodBatch, goodSettle, { [CREATOR_PAY]: cp.replace("load.miles_shortest ?? NaN", "load.miles_shortest ?? load.loaded_miles ?? NaN") });
  check(good, "Creator seed miles_shortest falls back to loaded (the old :468)", false, goodBatch, goodSettle, { [CREATOR_SEED]: cs.replace("miles_shortest: miles.miles_shortest,", "miles_shortest: load.miles_shortest ?? load.loaded_miles ?? load.line_haul_miles ?? null,") });
  check(good, "Creator seed practical straight from the document field (the old :463)", false, goodBatch, goodSettle, { [CREATOR_SEED]: cs.replace("miles_practical: miles.miles_practical,", "miles_practical: load.loaded_miles ?? load.line_haul_miles ?? null,") });
  check(good, "Creator seed books without short miles", false, goodBatch, goodSettle, { [CREATOR_SEED]: cs.replace('"short_miles_required"', '"x"') });
  check(good, "Creator preview says practical, not short", false, goodBatch, goodSettle, { [CREATOR_PREFLIGHT]: "const practical = Number(l.loaded_miles ?? l.line_haul_miles ?? 0);" });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${LABEL} SELFTEST PASS (19 cases)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — per-mile driver pay is SHORT miles only (owner law 443.192): no practical fallback, short-miles mint gate, no derivation formula; the Creator pays and books the document's miles as SHORT miles only`);

#!/usr/bin/env node
// verify-no-swallow-on-money-paths.mjs
// Recovered lost-work item (RELIABILITY-05): the event-spine heartbeat cron left a TODO to wire this guard
// so a money-path catch block can never silently swallow an error. On money paths a swallowed exception
// means a posting/settlement/spine-emit failure vanishes with no signal — the worst class of silent bug.
//
// This guard fails if any catch block on a money path is EMPTY or comment-only (a silent swallow). It scans
// the posting/settlement/spine-emit surface. Baseline today = 0 offenders, so this is a clean ratchet: a new
// silent catch on a money path fails CI. A legitimately-empty catch must either be made fail-loud (rethrow /
// return an explicit error / Sentry.captureException) or, if truly intentional, carry an inline
// `// eslint-disable-next-line no-empty` + a one-line reason so the intent is explicit (still flagged here
// unless the reason mentions "intentional swallow" — forcing a human decision).
//
// B-D4 (2026-07-16): EXTEND (do not rebuild). Confirmed + closed gaps vs CONTINUOUS-ASSURANCE / §D4:
//   already covered: accounting/*, driver-finance/*, banking/*, qbo-sync/* (A/P puller), posting/settlement
//   extended: integrations/qbo/*, integrations/plaid/*, integrations/relay-payments/*, qbo/*
//   + --selftest plants an empty catch under the A/P puller path → must turn red
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-swallow-on-money-paths";
const SRC = path.join(ROOT, "apps/backend/src");

// Money / banking-ingest / QBO A/P puller+projection surfaces. Extend only with proven money-adjacent paths.
export const MONEY =
  /accounting\/|poster\.service|driver-finance\/|-posting\/|spine-emit|factoring\/|settlement|qbo-sync\/|banking\/|integrations\/qbo\/|integrations\/plaid\/|integrations\/relay-payments\/|\/qbo\//i;

// empty catch OR catch whose body is only comments/whitespace = silent swallow.
//
// NO REGEX MATCHES THE BODY, deliberately. CODEQL-F02 tried twice to express "whitespace and comments
// only" as `(?:\s|//[^\n]*|/\*[\s\S]*?\*/)*` inside the match, and CodeQL flagged js/redos both
// times — correctly. Those branches are NOT disambiguated by their first character the way the previous
// comment here claimed: `//[^\n]*` can itself swallow later `/` characters, so a run like `////` has
// several valid parses, and when the closing `}` fails to match the engine walks every one of them.
// That is exponential, and this guard scans money-path sources in CI — a guard that hangs is a guard
// that does not run.
//
// A hand-written scan has no backtracking to exploit: it reads each character at most once, so it is
// linear by construction rather than by argument. It also fixes a correctness bug the regex could not
// have handled — a catch body containing braces (an object literal, a nested block) was never matched
// at all, so those swallows were invisible to this guard.
const CATCH_HEAD = /catch\s*(?:\([^)]*\))?\s*\{/g;

/**
 * From the index just past a `catch (...) {`, decide whether the block holds nothing but whitespace
 * and comments. Returns the index just past the closing `}` when it is a swallow, else -1.
 */
function scanEmptyCatchBody(src, i) {
  while (i < src.length) {
    const c = src[i];
    if (c === "}") return i + 1;
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i += 1; continue; }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i + 2);
      i = nl === -1 ? src.length : nl + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end === -1) return -1; // unterminated comment — not our business to judge
      i = end + 2;
      continue;
    }
    return -1; // real code in the body: not a swallow
  }
  return -1; // ran off the end without closing
}

/** Scan one file's source for empty/comment-only catch swallows on a money-path relative path. */
export function checkEmptyCatchSwallows(rel, src) {
  const offenders = [];
  if (!MONEY.test(rel)) return offenders;
  CATCH_HEAD.lastIndex = 0;
  let m;
  while ((m = CATCH_HEAD.exec(src))) {
    if (scanEmptyCatchBody(src, m.index + m[0].length) === -1) continue;
    const start = Math.max(0, m.index - 120);
    const ctx = src.slice(start, m.index);
    if (/intentional swallow|intentionally ignored/i.test(ctx)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    offenders.push(`${rel}:${line}`);
  }
  return offenders;
}

const SPINE_EMIT = /emit(?:Accounting|Banking|Dispatch|DriverRequest|Maintenance)\w*SpineEvent\s*\(|emitDriverRequestViewedOnce\s*\(/g;
const SWALLOW_CATCH = /\.catch\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*(?:undefined|null|void 0|\{\s*\})\s*\)/;
const LOGGED = /req\.log|reply\.log|app\.log|logger\.|console\.|throw|captureException|Sentry/;

/** Scan one file for spine-emit discard-.catch swallows. */
export function findSpineEmitSwallows(rel, src) {
  const offenders = [];
  if (/\.deprecated\.ts$/.test(rel)) return offenders;
  SPINE_EMIT.lastIndex = 0;
  let m;
  while ((m = SPINE_EMIT.exec(src))) {
    const window = src.slice(m.index, m.index + 700);
    const sw = SWALLOW_CATCH.exec(window);
    if (!sw) continue;
    const catchSeg = window.slice(sw.index, sw.index + sw[0].length);
    if (LOGGED.test(catchSeg)) continue;
    const line = src.slice(0, m.index + sw.index).split("\n").length;
    offenders.push(`${rel}:${line} (spine-emit swallow: ${m[0].replace(/\s*\($/, "")})`);
  }
  return offenders;
}

// SWL-2: fake-empty `.catch(() => [])` / `0` / `null` / `{}` on money-recon / finance / QBO mirror / relay ingest.
export const SWL2_PATHS =
  /(banking\/recon\.service|accounting\/finance-hub\.service|integrations\/qbo\/mirror-integrity\.service|integrations\/relay-payments\/|qbo-sync\/ap-bills)/;
const FAKE_EMPTY_CATCH = /\.catch\(\s*(?:async\s*)?\(\s*\)\s*=>\s*(?:\[\s*\]|0|null|\(\s*\{\s*\}\s*\)|\{\s*\})\s*\)/g;

export function checkFakeEmptySwallows(rel, src) {
  const offenders = [];
  if (!SWL2_PATHS.test(rel)) return offenders;
  FAKE_EMPTY_CATCH.lastIndex = 0;
  let m;
  while ((m = FAKE_EMPTY_CATCH.exec(src))) {
    const line = src.slice(0, m.index).split("\n").length;
    offenders.push(`${rel}:${line} (SWL-2 fake-empty catch: ${m[0]})`);
  }
  return offenders;
}

function walk(dir, onFile) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, onFile);
    else if (/\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name)) {
      const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
      onFile(rel, fs.readFileSync(fp, "utf8"));
    }
  }
}

export function run() {
  const offenders = [];
  if (!fs.existsSync(SRC)) return offenders;
  walk(SRC, (rel, src) => {
    offenders.push(...checkEmptyCatchSwallows(rel, src));
    offenders.push(...findSpineEmitSwallows(rel, src));
    offenders.push(...checkFakeEmptySwallows(rel, src));
  });
  return offenders;
}

function selftest() {
  const apPullerRel = "apps/backend/src/qbo-sync/ap-bills-puller.ts";
  const relayRel = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts";
  const plaidRel = "apps/backend/src/integrations/plaid/link.routes.ts";
  const qboIntRel = "apps/backend/src/integrations/qbo/qbo-sync.service.ts";

  const plantedAp = `
export async function pullApBillsFromQbo() {
  try {
    await sync();
  } catch (err) {
  }
}
`;
  const plantedRelay = `
export async function ingest() {
  try { await pull(); } catch (e) { /* ignore */ }
}
`;
  const honest = `
export async function pullApBillsFromQbo() {
  try {
    await sync();
  } catch (err) {
    logger.error({ err }, "ap bills pull failed");
    throw err;
  }
}
`;
  const intentional = `
export async function pullApBillsFromQbo() {
  // intentional swallow: best-effort metric stamp only
  try { await stamp(); } catch (err) {}
}
`;
  const plantedFakeEmpty = `
  const rows = await client.query("select 1").catch(() => []);
`;
  const checks = [
    ["MONEY matches A/P puller path", MONEY.test(apPullerRel)],
    ["MONEY matches relay-payments path", MONEY.test(relayRel)],
    ["MONEY matches plaid path", MONEY.test(plaidRel)],
    ["MONEY matches integrations/qbo path", MONEY.test(qboIntRel)],
    ["planted empty catch in A/P puller is flagged", checkEmptyCatchSwallows(apPullerRel, plantedAp).length === 1],
    ["planted comment-only catch in relay is flagged", checkEmptyCatchSwallows(relayRel, plantedRelay).length === 1],
    ["honest rethrow catch is not flagged", checkEmptyCatchSwallows(apPullerRel, honest).length === 0],
    ["intentional-swallow annotation is allowed", checkEmptyCatchSwallows(apPullerRel, intentional).length === 0],
    [
      "SWL-2 fake-empty on ap-bills path is flagged",
      checkFakeEmptySwallows("apps/backend/src/qbo-sync/ap-bills-puller.ts", plantedFakeEmpty).length === 1,
    ],
    [
      "SWL-2 fake-empty on relay path is flagged",
      checkFakeEmptySwallows(relayRel, plantedFakeEmpty).length === 1,
    ],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`[${LABEL}] --selftest FAIL:`);
    for (const [n] of failed) console.error(`  ✗ ${n}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS (${checks.length} checks; planted A/P puller swallow → red)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  const offenders = run();
  if (offenders.length) {
    console.error(`[${LABEL}] FAILED — ${offenders.length} silent swallow(s) on money/dispatch paths / spine emits:`);
    for (const o of offenders) console.error(`  ✗ ${o}`);
    console.error(`\nMoney/dispatch-path catches AND spine-emit failures must fail loud or LOG (rethrow /`);
    console.error(`return explicit error / req.log.warn / logger.warn / Sentry.captureException) — never silently`);
    console.error(`discard. If a swallow is truly intentional, add a "// intentional swallow: <reason>" note.`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — no silent swallows on money/dispatch paths or spine emits.`);
}

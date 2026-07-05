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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-swallow-on-money-paths";
const SRC = path.join(ROOT, "apps/backend/src");
const MONEY = /accounting\/|poster\.service|driver-finance\/|-posting\/|spine-emit|factoring\/|settlement/i;
// empty catch OR catch whose body is only comments/whitespace = silent swallow
const SWALLOW = /catch\s*\([^)]*\)\s*\{\s*(\/\/[^\n]*\s*|\/\*[\s\S]*?\*\/\s*)*\}/g;

const offenders = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp);
    else if (/\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name)) {
      const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
      if (!MONEY.test(rel)) continue;
      const src = fs.readFileSync(fp, "utf8");
      let m;
      while ((m = SWALLOW.exec(src))) {
        // allow an explicit intentional-swallow annotation
        const start = Math.max(0, m.index - 120);
        const ctx = src.slice(start, m.index);
        if (/intentional swallow|intentionally ignored/i.test(ctx)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${line}`);
      }
    }
  }
};
if (fs.existsSync(SRC)) walk(SRC);

// ── SWL-1 extension ────────────────────────────────────────────────────────────────────────────
// The empty/comment-only catch check above does NOT catch the OTHER swallow shape used on the
// audit spine: a fire-and-forget promise whose rejection is discarded with `.catch(() => undefined)`
// (or `() => {}` / `() => null` / `() => void 0`). On a money/dispatch spine emit that means a failed
// audit event vanishes with NO signal. This check bans a discard-`.catch` chained onto ANY canonical
// spine-emit helper call, regardless of path (the helper name is the money/dispatch-audit signal).
// The correct pattern (already used at dispatch/loads.routes.ts): `.catch((err) => req.log.warn(...))`
// in a route, or `logger.warn(...)` in a service. Archived `.deprecated.ts` routes are unmounted and
// excluded by convention (their own header notes the `.deprecated` suffix opt-out).
const SPINE_EMIT = /emit(?:Accounting|Banking|Dispatch|DriverRequest|Maintenance)\w*SpineEvent\s*\(|emitDriverRequestViewedOnce\s*\(/g;
// A `.catch` whose handler body is a bare swallow (undefined/null/{}/void 0) with no log/throw/report.
const SWALLOW_CATCH = /\.catch\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*(?:undefined|null|void 0|\{\s*\})\s*\)/;
const LOGGED = /req\.log|reply\.log|app\.log|logger\.|console\.|throw|captureException|Sentry/;

const walkSpine = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walkSpine(fp);
    else if (/\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name) && !/\.deprecated\.ts$/.test(e.name)) {
      const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
      const src = fs.readFileSync(fp, "utf8");
      let m;
      SPINE_EMIT.lastIndex = 0;
      while ((m = SPINE_EMIT.exec(src))) {
        // Window from the emit call to the end of its fire-and-forget wrapper's `.catch(...)`.
        const window = src.slice(m.index, m.index + 700);
        const sw = SWALLOW_CATCH.exec(window);
        if (!sw) continue;
        // If the same window carries a logging/throwing catch elsewhere, don't false-positive.
        const catchSeg = window.slice(sw.index, sw.index + sw[0].length);
        if (LOGGED.test(catchSeg)) continue;
        const line = src.slice(0, m.index + sw.index).split("\n").length;
        offenders.push(`${rel}:${line} (spine-emit swallow: ${m[0].replace(/\s*\($/, "")})`);
      }
    }
  }
};
if (fs.existsSync(SRC)) walkSpine(SRC);

// ── SWL-2 extension ────────────────────────────────────────────────────────────────────────────
// A THIRD swallow shape: a discard-`.catch` that fakes an EMPTY/ZERO result — `.catch(() => [])`,
// `.catch(() => 0)`, `.catch(() => ({}))`, `.catch(() => null)` — on a money-reconciliation read.
// Unlike the spine-emit case this isn't fire-and-forget: the faked value flows straight into a
// user-facing figure (a $0 cash KPI, "no suggestions", "in sync"), so a real query failure looks
// identical to genuinely-empty data. Ban it on the banking-recon / finance-hub / qbo-mirror surface;
// the correct fix is a try/catch that logs with context and surfaces an error/unavailable state.
const SWL2_PATHS = /(banking\/recon\.service|accounting\/finance-hub\.service|integrations\/qbo\/mirror-integrity\.service)/;
const FAKE_EMPTY_CATCH = /\.catch\(\s*(?:async\s*)?\(\s*\)\s*=>\s*(?:\[\s*\]|0|null|\(\s*\{\s*\}\s*\)|\{\s*\})\s*\)/g;

const walkFakeEmpty = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walkFakeEmpty(fp);
    else if (/\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name)) {
      const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
      if (!SWL2_PATHS.test(rel)) continue;
      const src = fs.readFileSync(fp, "utf8");
      let m;
      FAKE_EMPTY_CATCH.lastIndex = 0;
      while ((m = FAKE_EMPTY_CATCH.exec(src))) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${line} (SWL-2 fake-empty catch: ${m[0]})`);
      }
    }
  }
};
if (fs.existsSync(SRC)) walkFakeEmpty(SRC);

if (offenders.length) {
  console.error(`[${LABEL}] FAILED — ${offenders.length} silent swallow(s) on money/dispatch paths / spine emits:`);
  for (const o of offenders) console.error(`  ✗ ${o}`);
  console.error(`\nMoney/dispatch-path catches AND spine-emit failures must fail loud or LOG (rethrow /`);
  console.error(`return explicit error / req.log.warn / logger.warn / Sentry.captureException) — never silently`);
  console.error(`discard. If a swallow is truly intentional, add a "// intentional swallow: <reason>" note.`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — no silent swallows on money/dispatch paths or spine emits.`);

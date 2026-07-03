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

if (offenders.length) {
  console.error(`[${LABEL}] FAILED — ${offenders.length} silent (empty/comment-only) catch block(s) on money paths:`);
  for (const o of offenders) console.error(`  ✗ ${o}`);
  console.error(`\nMoney-path catches must fail loud (rethrow / return explicit error / Sentry.captureException),`);
  console.error(`not silently swallow. If a swallow is truly intentional, add a "// intentional swallow: <reason>" note.`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — no silent swallows on money paths (posting/settlement/spine-emit).`);

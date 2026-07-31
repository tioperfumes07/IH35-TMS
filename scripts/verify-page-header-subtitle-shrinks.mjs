#!/usr/bin/env node
/**
 * GUARD — the PageHeader subtitle must be allowed to shrink, or it renders through the action buttons.
 *
 * THE BUG, observed live on app.ih35dispatch.com/maintenance: .page-header-subtitle was
 * `flex-shrink: 0; white-space: nowrap` and .page-header-actions is also `flex-shrink: 0`. Neither
 * yielded. The title absorbs pressure first (flex: 1 1 auto; min-width: 0), but once it is fully
 * collapsed there is nothing left to give, so a 62-character subtitle rendered straight across three
 * "+ Create" buttons — text unreadable, buttons ambiguous to click.
 *
 * WHY THE SUBTITLE AND NOT THE ACTIONS: the subtitle is descriptive and never interactive, so it is the
 * correct thing to truncate. Clipping a control is worse than clipping prose — a half-rendered
 * "+ Create Work Order" is a mis-click waiting to happen. This guard therefore asserts BOTH halves:
 * the subtitle shrinks, and the actions do NOT.
 *
 * min-width: 0 is asserted because without it a flex item will not shrink below its content size and
 * text-overflow: ellipsis silently never engages — the rule would look correct and do nothing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:page-header-subtitle-shrinks";
const CSS = "apps/frontend/src/components/forms/shared/PageHeader.css";

export function ruleBody(css, selector) {
  const m = css.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
}

export function analyse(css) {
  const problems = [];
  const sub = ruleBody(css, ".page-header-subtitle");
  const act = ruleBody(css, ".page-header-actions");
  if (!sub) {
    problems.push(`${CSS}: .page-header-subtitle rule not found — refusing to pass on a file I did not inspect.`);
    return problems;
  }
  const shrink = sub.match(/flex-shrink:\s*(\d+)/);
  if (!shrink || Number(shrink[1]) === 0) {
    problems.push(".page-header-subtitle has flex-shrink: 0 (or none) — it will render through the action buttons when the row overflows.");
  } else if (Number(shrink[1]) < 10) {
    // PRIORITY, not proportion. At flex-shrink: 1 the subtitle and the title shrink TOGETHER, and
    // /maintenance rendered "Main…" instead of "Maintenance" — verified live. The subtitle must carry a
    // large weight so it absorbs effectively all overflow before the module name loses a pixel.
    problems.push(`.page-header-subtitle has flex-shrink: ${shrink[1]} — too low. It shrinks in PROPORTION with .page-header-title (also shrinkable), so the TITLE truncates too ("Main…" for "Maintenance"). Use a large weight (e.g. 999) so the subtitle absorbs the overflow first.`);
  }
  if (!/min-width:\s*0\b/.test(sub)) {
    problems.push(".page-header-subtitle lacks min-width: 0 — a flex item will not shrink below its content size, so text-overflow: ellipsis never engages.");
  }
  if (!/text-overflow:\s*ellipsis/.test(sub)) {
    problems.push(".page-header-subtitle lacks text-overflow: ellipsis — it will clip mid-glyph instead of truncating cleanly.");
  }
  if (act && !/flex-shrink:\s*0\b/.test(act)) {
    problems.push(".page-header-actions must KEEP flex-shrink: 0 — clipping an interactive control is worse than truncating prose.");
  }
  return problems;
}

export function run() {
  let css = "";
  try {
    css = readFileSync(path.join(ROOT, CSS), "utf8");
  } catch (err) {
    return { ok: false, message: `${LABEL} FAILED:\n  - cannot read ${CSS} (${err.message})` };
  }
  const problems = analyse(css);
  if (problems.length) return { ok: false, message: `${LABEL} FAILED:\n  - ${problems.join("\n  - ")}` };
  return { ok: true, message: `${LABEL} OK — subtitle truncates, actions stay intact` };
}

function selftest() {
  let bad = 0;
  const t = (n, c) => { if (!c) { console.error(`  SELFTEST FAIL: ${n}`); bad++; } };
  const GOOD = ".page-header-subtitle { flex-shrink: 999; min-width: 0; overflow: hidden; text-overflow: ellipsis; } .page-header-actions { flex-shrink: 0; }";
  const LOW  = ".page-header-subtitle { flex-shrink: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; } .page-header-actions { flex-shrink: 0; }";
  const OLD  = ".page-header-subtitle { flex-shrink: 0; white-space: nowrap; } .page-header-actions { flex-shrink: 0; }";
  const NOMIN = ".page-header-subtitle { flex-shrink: 999; text-overflow: ellipsis; } .page-header-actions { flex-shrink: 0; }";
  const ACTSHRINK = ".page-header-subtitle { flex-shrink: 999; min-width: 0; text-overflow: ellipsis; } .page-header-actions { flex-shrink: 1; }";

  t("the ORIGINAL overlapping CSS is caught", analyse(OLD).length >= 1);
  t("missing min-width:0 is caught", analyse(NOMIN).length === 1);
  t("actions allowed to shrink is caught", analyse(ACTSHRINK).length === 1);
  t("correct CSS passes", analyse(GOOD).length === 0);
  t("REGRESSION: flex-shrink 1 truncates the TITLE and is caught", analyse(LOW).length === 1);
  t("missing rule FAILS CLOSED", analyse(".something-else{}").length === 1);
  t("mutation: ruleBody finds the subtitle body", (ruleBody(GOOD, ".page-header-subtitle") || "").includes("flex-shrink: 999"));
  t("mutation: ruleBody returns null when absent", ruleBody(".x{}", ".page-header-subtitle") === null);
  return bad;
}

const DIRECT = process.argv[1] && process.argv[1].endsWith("verify-page-header-subtitle-shrinks.mjs");
if (DIRECT) {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    console.log(bad === 0 ? `${LABEL} SELFTEST PASS — 8 cases` : `${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(bad === 0 ? 0 : 1);
  }
  const r = run();
  console.log(r.message);
  process.exit(r.ok ? 0 : 1);
}

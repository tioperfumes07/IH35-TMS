#!/usr/bin/env node
/**
 * GUARD: LV-MASTER-DETAIL-ROW-CLICK-NAVIGATES-AWAY.
 *
 * CardLink is the shared master-detail row control: every caller's doc comment promises a plain
 * click "also selects the master-detail row" (stay on the list, select in place), but a bare
 * react-router <Link> always navigates away regardless of onNavigate. This guard proves the fix
 * stays live: a genuinely plain left-click (no modifier, primary button) is intercepted with
 * preventDefault() + onNavigate(), while modified clicks (cmd/ctrl/shift/alt) and clicks with no
 * onNavigate handler are left to navigate normally (new-tab, hover preview, keyboard Enter unaffected).
 */
import fs from "node:fs";

const LABEL = "verify-cardlink-plain-click-selects-in-place";
const REL = "apps/frontend/src/components/shared/CardLink.tsx";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  if (!/event\.button === 0/.test(body)) failures.push("must gate on primary-button (button === 0) clicks only");
  if (!/!event\.metaKey/.test(body) || !/!event\.ctrlKey/.test(body)) {
    failures.push("must exclude cmd/ctrl-click (open-in-new-tab) from the intercept");
  }
  if (!/!event\.shiftKey/.test(body)) failures.push("must exclude shift-click from the intercept");
  if (!/onNavigate\s*&&/.test(body) && !/&&\s*onNavigate/.test(body)) {
    failures.push("intercept must require an onNavigate handler to exist");
  }
  if (!/event\.preventDefault\(\)/.test(body)) failures.push("plain click must preventDefault() before selecting in place");
  if (!/onNavigate\(\)/.test(body)) failures.push("plain click must still call onNavigate() to select in place");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["event.button === 0", "true"],
    ["!event.metaKey", "true"],
    ["!event.ctrlKey", "true"],
    ["!event.shiftKey", "true"],
    ["isPlainLeftClick && onNavigate", "isPlainLeftClick"],
    ["event.preventDefault();\n          onNavigate();", "onNavigate?.();"],
  ];
  let failed = false;
  for (const [from, to] of mutations) {
    if (!source.includes(from)) {
      console.error(`${LABEL} SELFTEST FAIL — mutation anchor not found in source: ${JSON.stringify(from)}`);
      failed = true;
      continue;
    }
    const changed = source.replace(from, to);
    if (changed === source || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${JSON.stringify(from)}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — button/modifier gating, onNavigate guard, and preventDefault+select mutations all detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${REL} intercepts plain left-clicks only, selects in place, leaves modified clicks to navigate normally`);

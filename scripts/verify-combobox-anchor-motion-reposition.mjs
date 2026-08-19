#!/usr/bin/env node
/**
 * LV-DISPATCH-LOAD-DRAWER-STOPS-PICKER-DROPDOWN-NOT-VISIBLE
 *
 * Portaled fixed-position Combobox listboxes must follow an anchor moved by a drawer/modal CSS
 * transition. Scroll/resize listeners alone cannot observe transform-driven movement.
 */
import fs from "node:fs";

const file = "apps/frontend/src/components/Combobox.tsx";
const source = fs.readFileSync(file, "utf8");

function failuresFor(text) {
  const failures = [];
  if (!/remainingOpeningFrames\s*=\s*30/.test(text)) failures.push("missing bounded opening-animation remeasure window");
  if (!/requestAnimationFrame\(followOpeningTransition\)/.test(text)) failures.push("missing requestAnimationFrame anchor follow loop");
  if (!/addEventListener\("transitionend", reposition, true\)/.test(text)) failures.push("missing transitionend final-position remeasure");
  if (!/cancelAnimationFrame\(animationFrame\)/.test(text)) failures.push("missing animation-frame cleanup");
  if (!/removeEventListener\("transitionend", reposition, true\)/.test(text)) failures.push("missing transition listener cleanup");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["remainingOpeningFrames = 30", "remainingOpeningFrames = 0"],
    ["requestAnimationFrame(followOpeningTransition)", "requestAnimationFrame(() => undefined)"],
    ['addEventListener("transitionend", reposition, true)', 'addEventListener("transitioncancel", reposition, true)'],
    ["cancelAnimationFrame(animationFrame)", "clearTimeout(animationFrame)"],
    ['removeEventListener("transitionend", reposition, true)', 'removeEventListener("transitioncancel", reposition, true)'],
  ];
  for (const [needle, replacement] of mutations) {
    if (!source.includes(needle)) throw new Error(`selftest anchor missing: ${needle}`);
    const mutated = source.split(needle).join(replacement);
    if (failuresFor(mutated).length === 0) throw new Error(`planted defect escaped: ${needle}`);
  }
  console.log(`verify-combobox-anchor-motion-reposition SELFTEST PASS — ${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = failuresFor(source);
if (failures.length) {
  console.error(`verify-combobox-anchor-motion-reposition FAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("verify-combobox-anchor-motion-reposition PASS — portal follows transform-moving anchors and cleans up listeners");

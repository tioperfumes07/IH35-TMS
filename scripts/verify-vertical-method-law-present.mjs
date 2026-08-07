#!/usr/bin/env node
/**
 * verify-vertical-method-law-present.mjs — LAW-2026-08-07-VERTICAL-METHOD.
 *
 * THE LAW (owner, permanent): work is drained VERTICALLY, by CLASS, GLOBALLY and UNIVERSALLY — one
 * defect class swept across the whole system at once. NOT module-by-module. NOT the old block way.
 *
 * WHY IT NEEDS A GUARD AND NOT JUST A SENTENCE. The rule was already written in all four lane standing
 * orders and a lane still reverted to module-by-module work. A rule that lives only in prose is
 * followed exactly as long as someone remembers it, and the permanent law is explicit that "LAW =
 * ENFORCED GUARD, OR IT IS NOT LAW". This is the cheapest thing that can actually fail: a presence
 * ratchet, the same pattern the repo already uses for the standing directive and the owner quality
 * compact. It guarantees no lane can quietly delete the method from its own operating order — which is
 * the only mechanical failure mode available here, because whether a given PR is "vertical" is a
 * judgment a static check cannot make honestly.
 *
 * WHAT IT ASSERTS: every docs/standing-orders/*.md carries the vertical-method rule. If a lane order
 * exists, it states the method. Existence-only, sub-second, and it cannot produce a false red.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: judge whether a PR is vertical. That is judgment, and the law is
 * clear that judgment rules stay judgment rather than being force-guarded into noise.
 *
 * THE METHOD, stated once so the guard's own file carries it:
 *   1. Pick a defect CLASS, never a module.
 *   2. Sweep it GLOBALLY — every instance in the repo and on prod, measured, not estimated.
 *   3. Classify ORIGIN before calling any gap a defect (imported rows are expected state).
 *   4. Fix the ROOT CAUSE once, in one PR, for every instance.
 *   5. Ship ONE mutation-proven ratcheting guard: plant defect = RED, restore = GREEN.
 *   6. A class is drained only at zero live instances AND a guard that exists.
 *   7. Modules certify LAST, from drained classes — never the other way round.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vertical-method-law-present";
const DIR = path.join(ROOT, "docs", "standing-orders");

/** Any one of these phrasings satisfies the rule — lanes word their orders differently. */
const METHOD = /vertical sweep by class|vertical coding|by class, not module|class[- ]sweep, not module/i;

export function findOrdersMissingMethod(dir = DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !METHOD.test(fs.readFileSync(path.join(dir, f), "utf8")))
    .sort();
}

function report(missing) {
  if (!missing.length) {
    console.log(`${LABEL} OK — every lane standing order carries the vertical-method law`);
    return 0;
  }
  console.error(`${LABEL} FAIL — ${missing.length} lane standing order(s) do not state the method:\n`);
  for (const f of missing) console.error(`  - docs/standing-orders/${f}`);
  console.error(
    `\nWork is drained VERTICALLY, by CLASS, globally and universally — one defect class swept across\n` +
      `the whole system at once. Not module-by-module. Not the old block way. The rule was already in\n` +
      `all four lane orders and a lane still reverted, which is why it is now a guard rather than prose.\n\n` +
      `Fix: restore the method line to the order. Never delete it to make this pass.\n`
  );
  return 1;
}

function selftest() {
  const failures = [];
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vmethod-"));
  const f = path.join(tmp, "LANE.md");

  fs.writeFileSync(f, "# order\nMETHOD = VERTICAL SWEEP BY CLASS, not module-by-module.\n");
  if (findOrdersMissingMethod(tmp).length !== 0) failures.push("case1 FAIL — an order stating the method must be GREEN.");

  fs.writeFileSync(f, "# order\nWork module by module until each is done.\n");
  if (findOrdersMissingMethod(tmp).length !== 1) failures.push("case2 FAIL — an order missing the method must go RED.");

  fs.writeFileSync(f, "# order\nDrain each defect class globally (vertical coding), then certify modules.\n");
  if (findOrdersMissingMethod(tmp).length !== 0) failures.push("case3 FAIL — an alternate phrasing must be GREEN.");

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — method present GREEN, method deleted RED, alternate phrasing GREEN`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { createRequire } = await import("node:module");
  globalThis.require = createRequire(import.meta.url);
  process.exit(process.argv.includes("--selftest") ? selftest() : report(findOrdersMissingMethod()));
}

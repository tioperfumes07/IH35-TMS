#!/usr/bin/env node
/**
 * A commit may not claim N of N (module complete) while REMAINING is non-empty,
 * and may not assert MODULE_PROGRESS without Live=.
 * Would have rejected PR #16832 ("39 of 39" + "Not fully wired" in the same message).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-module-progress-not-authored";

export function assertModuleProgressNotAuthored(msg) {
  const fails = [];
  const progress = [...msg.matchAll(/^MODULE_PROGRESS:\s*(\S+)\s+(\d+)\s+of\s+(\d+)/gm)];
  const remaining = (msg.match(/^REMAINING:\s*(.*)$/m)?.[1] ?? "").trim();
  const remainingHonestLive = /^Live=(UNVERIFIED|BLOCKED)\b/i.test(remaining);
  const remainingIsOpen =
    remaining && !/^(n\/a|none|-)$/i.test(remaining) && !remainingHonestLive;

  for (const [, mod, n, m] of progress) {
    if (n === m && remainingIsOpen) {
      fails.push(
        `${mod} claims ${n} of ${m} (complete) while REMAINING is non-empty: "${remaining.slice(0, 90)}"`,
      );
    }
  }
  if (progress.length && !/Live=/.test(msg)) {
    fails.push("MODULE_PROGRESS asserted with no Live= claim");
  }
  return fails;
}

function tipMessage() {
  return execSync("git log -1 --pretty=%B", { cwd: ROOT, encoding: "utf8" });
}

if (process.argv.includes("--selftest")) {
  const planted = `FINDING: X
MODULE_PROGRESS: accounting 39 of 39
LIVE PROOF: exit 0
REMAINING: G1 leftover hops still open
`;
  const found = assertModuleProgressNotAuthored(planted);
  if (!found.some((f) => /39 of 39/.test(f))) {
    console.error(`${LABEL} SELFTEST FAIL — planted 39 of 39 + open REMAINING not detected`);
    process.exit(1);
  }
  const ok = assertModuleProgressNotAuthored(`MODULE_PROGRESS: accounting 38 of 39
Live=BLOCKED
REMAINING: G1 is_sample_data writers
`);
  if (ok.length) {
    console.error(`${LABEL} SELFTEST FAIL — honest N<M should pass: ${ok.join("; ")}`);
    process.exit(1);
  }
  const honestLive = assertModuleProgressNotAuthored(`FINDING: X
MODULE_PROGRESS: N/A
Live=UNVERIFIED
REMAINING: Live=UNVERIFIED until a deploy >= this SHA serves healthz; stamp coverage 1 of N leaves.
`);
  if (honestLive.length) {
    console.error(`${LABEL} SELFTEST FAIL — honest Live=UNVERIFIED REMAINING rejected: ${honestLive.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const fails = assertModuleProgressNotAuthored(tipMessage());
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);

#!/usr/bin/env node
/** Ratchet dispatch-refinements route catches against raw internal-error rethrows. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/backend/src/dispatch/dispatch-refinements.routes.ts";
const LABEL = "verify-dispatch-refinements-errors-human";

export function audit(src) {
  const problems = [];
  if (/catch \(e\)[\s\S]{0,900}?throw e;/.test(src)) {
    problems.push(`${TARGET}: catch still rethrows an internal exception`);
  }
  const messages = [
    "Could not reassign this load. Try again or contact support.",
    "Could not load stops for this load. Try again or contact support.",
    "Could not update stops for this load. Try again or contact support.",
    "Could not load available drivers. Try again or contact support.",
    "Could not calculate ETA for this load. Try again or contact support.",
  ];
  for (const message of messages) {
    if (!src.includes(`message: "${message}"`)) {
      problems.push(`${TARGET}: missing human fallback: ${message}`);
    }
  }
  const loggedCatches = src.match(/req\.log\.error\(\{ err: e \}/g) ?? [];
  if (loggedCatches.length < 5) {
    problems.push(`${TARGET}: every generic failure path must log its internal exception`);
  }
  return problems;
}

function selftest() {
  const messages = [
    "Could not reassign this load. Try again or contact support.",
    "Could not load stops for this load. Try again or contact support.",
    "Could not update stops for this load. Try again or contact support.",
    "Could not load available drivers. Try again or contact support.",
    "Could not calculate ETA for this load. Try again or contact support.",
  ];
  const good = messages
    .map((message) => `catch (e) { req.log.error({ err: e }, "context"); return reply.code(500).send({ error: "server_error", message: "${message}" }); }`)
    .join("\n");
  const bad = `catch (e) { throw e; }`;
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  if (audit(bad).length < 7) failures.push("raw rethrow regression was not fully detected");
  if (failures.length) {
    failures.forEach((failure) => console.error(`  ✗ ${LABEL}: ${failure}`));
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = audit(readFileSync(join(ROOT, TARGET), "utf8"));
  if (problems.length) {
    problems.forEach((problem) => console.error(`  ✗ ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — refinement failures are logged and humanized`);
}

#!/usr/bin/env node
/**
 * LV-CI-DEPENDABOT-RED (cause 2) — any workflow that gates on the PR body / evidence block
 * must exempt dependabot[bot], because dependabot cannot author a Rule-16 evidence block.
 *
 * Sibling body-format gates are also covered: a workflow is considered body-gating if its
 * name/job name/step name mentions "PR body", "evidence block", or "evidence" and it triggers
 * on pull_request.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const WORKFLOWS_DIR = resolve(ROOT, ".github/workflows");

const BODY_GATE_HINTS = /pr[_\- ]body|evidence[_\- ]?block|check-pr-evidence/i;
const EXEMPT_RE = /github\.actor\s*!=\s*['"]dependabot\[bot\]['"]/;
const DOCUMENTED_RE = /dependabot-exempt:\s*documented/i;

export function run() {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  const offenders = [];

  for (const file of files) {
    const text = readFileSync(resolve(WORKFLOWS_DIR, file), "utf8");
    const isPullRequest = /on:\s*pull_request/.test(text) || /^\s*pull_request:/m.test(text);
    if (!isPullRequest) continue;

    const looksLikeBodyGate = BODY_GATE_HINTS.test(text);
    if (!looksLikeBodyGate) continue;

    const exempt = EXEMPT_RE.test(text);
    const documented = DOCUMENTED_RE.test(text);
    if (!exempt && !documented) {
      offenders.push(file);
    }
  }

  if (offenders.length > 0) {
    return {
      ok: false,
      message: `verify-dependabot-exempt-in-body-gates FAIL — ${offenders.length} PR-body/evidence workflow(s) do not exempt dependabot[bot] (nor document an intentional exemption): ${offenders.join(", ")}`,
    };
  }

  return { ok: true, message: "verify-dependabot-exempt-in-body-gates OK" };
}

function selftest() {
  const { ok, message } = run();
  if (!ok) throw new Error(`selftest expected OK but got: ${message}`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-dependabot-exempt-in-body-gates selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}

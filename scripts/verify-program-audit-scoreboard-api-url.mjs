#!/usr/bin/env node
/**
 * GUARD: Program Audit Scoreboard contract (PR #4141).
 *
 * Locks:
 * 1) No bare fetch("/api/...") — must use resolveApiUrl
 * 2) No dangerouslySetInnerHTML / __html call sites
 * 3) Guard items use `text` (markdown), never `html`
 * 4) frontend build does NOT run gen:program-scoreboard (CI dirty-tree / security-audit)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/program/AuditScoreboardPage.tsx";
const DATA = "apps/frontend/src/pages/program/programScoreboard.data.ts";
const FE_PKG = "apps/frontend/package.json";
const LABEL = "verify-program-audit-scoreboard-api-url";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertScoreboardContract(sources) {
  const page = sources?.[PAGE] ?? read(PAGE);
  const data = sources?.[DATA] ?? read(DATA);
  const pkg = sources?.[FE_PKG] ?? read(FE_PKG);
  const problems = [];

  if (!/from ["'].*api\/client["']/.test(page) || !/resolveApiUrl/.test(page)) {
    problems.push(`${PAGE}: must import resolveApiUrl from api/client`);
  }
  if (!/fetch\(\s*resolveApiUrl\(\s*["']\/api\/v1\/program\/audit-scoreboard["']\s*\)/.test(page)) {
    problems.push(
      `${PAGE}: audit-scoreboard fetch must use resolveApiUrl("/api/v1/program/audit-scoreboard")`
    );
  }
  if (/fetch\(\s*["']\/api\/v1\/program\/audit-scoreboard["']/.test(page)) {
    problems.push(`${PAGE}: bare fetch("/api/v1/program/audit-scoreboard") is forbidden`);
  }
  if (/dangerouslySetInnerHTML\s*=/.test(page) || /__html\s*:/.test(page)) {
    problems.push(`${PAGE}: dangerouslySetInnerHTML / __html call sites are forbidden — use fmt()`);
  }
  if (/\bg\.html\b/.test(page)) {
    problems.push(`${PAGE}: must read g.text, not g.html`);
  }
  if (!/fmt\(\s*g\.text\s*\)/.test(page)) {
    problems.push(`${PAGE}: must render guard copy via fmt(g.text)`);
  }
  if (/interface GuardItem/.test(data) && /html:\s*string/.test(data)) {
    problems.push(`${DATA}: GuardItem must use text: string, not html`);
  }
  if (/"html"\s*:/.test(data)) {
    problems.push(`${DATA}: guard entries must use "text", never "html"`);
  }
  let build;
  try {
    build = JSON.parse(pkg).scripts?.build ?? "";
  } catch {
    problems.push(`${FE_PKG}: unreadable`);
    return problems;
  }
  if (/gen:program-scoreboard/.test(build)) {
    problems.push(
      `${FE_PKG}: build must not run gen:program-scoreboard (dirties tree → security-audit checkout fails)`
    );
  }
  // §7 palette + datetime false-positive locks (pre-push verify-static on #4141).
  if (/#2563eb|#7c3aed/.test(page)) {
    problems.push(`${PAGE}: §7 forbids blue/purple accent hex (#2563eb / #7c3aed) — use navy/slate tokens`);
  }
  if (/\{sb\.meta\.prodReadAt\}/.test(page)) {
    problems.push(
      `${PAGE}: do not render {sb.meta.prodReadAt} — alias to a non-*At local (datetime guard false positive)`
    );
  }
  if (/fetch\(\s*[`'"]\/api\//.test(page)) {
    problems.push(`${PAGE}: comment/code must not contain fetch("/api/…") literal (raw-fetch guard)`);
  }

  const routeRel = "apps/backend/src/program/audit-scoreboard.routes.ts";
  const route = sources?.[routeRel] ?? (fs.existsSync(path.join(ROOT, routeRel)) ? read(routeRel) : "");
  if (route && !/rateLimit\s*:\s*\{\s*max\s*:/.test(route)) {
    problems.push(`${routeRel}: GET audit-scoreboard must set config.rateLimit (CodeQL missing-rate-limiting)`);
  }

  return problems;
}

if (SELFTEST) {
  const live = { [PAGE]: read(PAGE), [DATA]: read(DATA), [FE_PKG]: read(FE_PKG) };
  const failures = [];
  const expect = (name, mutated, needle) => {
    const problems = assertScoreboardContract(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };
  expect(
    "bare-fetch",
    {
      ...live,
      [PAGE]: live[PAGE].replace(
        /fetch\(\s*resolveApiUrl\(\s*["']\/api\/v1\/program\/audit-scoreboard["']\s*\)/,
        'fetch("/api/v1/program/audit-scoreboard"'
      ),
    },
    "bare fetch"
  );
  expect(
    "innerhtml-returns",
    {
      ...live,
      [PAGE]: live[PAGE].replace("fmt(g.text)", "dangerouslySetInnerHTML={{ __html: g.text }}"),
    },
    "dangerouslySetInnerHTML"
  );
  expect(
    "gen-in-build",
    {
      ...live,
      [FE_PKG]: live[FE_PKG].replace(
        '"build": "',
        '"build": "npm run gen:program-scoreboard --prefix ../.. && '
      ),
    },
    "must not run gen:program-scoreboard"
  );
  const liveProblems = assertScoreboardContract(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted defects caught, live clean`);
  process.exit(0);
}

const problems = assertScoreboardContract();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — resolveApiUrl · no innerHTML · GuardItem.text · build without gen`);

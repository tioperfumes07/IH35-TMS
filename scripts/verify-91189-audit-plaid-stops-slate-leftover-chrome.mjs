#!/usr/bin/env node
import { readFileSync } from "node:fs";
const TARGETS = [
  "apps/frontend/src/components/audit/AuditEventCard.tsx",
  "apps/frontend/src/pages/banking/components/PlaidReconnectButton.tsx",
  "apps/frontend/src/components/shared/StopsMilesSection.tsx",
];
const LABEL = "verify-91189-audit-plaid-stops-slate-leftover-chrome";
function leftoverHits(src) {
  const hits = [];
  if (src.includes("text-slate-") || src.includes("border-slate-") || src.includes("border-l-slate-") || src.includes("border-t-slate-") || src.includes("bg-slate-") || src.includes("hover:bg-slate-") || src.includes("hover:text-slate-") || src.includes("focus:bg-slate-") || src.includes("divide-slate-") || src.includes("sm:divide-slate-") || src.includes("ring-slate-") || src.includes("decoration-slate-") || src.includes("focus:ring-slate-") || src.includes("focus-visible:ring-slate-") || src.includes("focus:border-slate-") || src.includes("outline-slate-") || src.includes("focus-visible:outline-slate-") || src.includes("accent-slate-") || src.includes("disabled:bg-slate-") || src.includes("hover:border-slate-") || src.includes("caret-slate-")) hits.push("leftover slate class");
  return hits;
}
function audit(sources) { const fails=[]; for (const [path, src] of sources) for (const e of leftoverHits(src)) fails.push(`${path}: ${e}`); return fails; }
function main() {
  const sources = TARGETS.map((path) => [path, readFileSync(path, "utf8")]);
  if (process.argv.includes("--selftest")) {
    const [path0, src0] = sources[0];
    const planted = `${src0}\n<span className="text-slate-700 border-slate-200 bg-slate-50">plant</span>\n`;
    if (!audit([[path0, planted], ...sources.slice(1)]).some((e) => e.includes(path0) && e.includes("leftover slate class"))) { console.error(`${LABEL} SELFTEST FAIL leftover plant escaped`); process.exit(1); }
    console.log(`${LABEL}: SELFTEST PASS leftover slate class plant`); process.exit(0);
  }
  const fails = audit(sources);
  if (fails.length) { console.error(`${LABEL}: FAIL`); for (const e of fails) console.error(`  - ${e}`); process.exit(1); }
  console.log(`${LABEL}: PASS leftover slate class refuse (${TARGETS.length} files)`);
}
main();

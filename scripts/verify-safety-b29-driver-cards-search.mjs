#!/usr/bin/env node
/** SAF-B29 — Driver Safety Cards roster must server-search (not silent 200-cap). */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const FILE = join(ROOT, "apps/frontend/src/components/safety/DriverSafetyCards.tsx");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

export function run() {
  const s = strip(readFileSync(FILE, "utf8"));
  const checks = [
    ["term-is-state", /const \[rosterSearch, setRosterSearch\] = useState/.test(s)],
    ["term-reaches-server", /search:\s*rosterSearch \|\| undefined/.test(s)],
    ["term-in-query-key", /queryKey:\s*\["safety-cards",\s*"drivers",\s*companyId,\s*rosterSearch\]/.test(s)],
    ["search-input", /data-testid="driver-cards-search"/.test(s)],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([id]) => id);
  const ok = failed.length === 0;
  return {
    ok,
    failed,
    message: ok
      ? `PASS: Driver Safety Cards server-search locked (${checks.length}/${checks.length}).`
      : `FAIL: ${failed.join(", ")}`,
  };
}

function selftest() {
  const original = readFileSync(FILE, "utf8");
  if (!run().ok) {
    console.error("SELFTEST FAIL: already red");
    process.exit(1);
  }
  try {
    writeFileSync(FILE, original.replace(", rosterSearch]", "]"), "utf8");
    const caught = run();
    if (caught.ok || !caught.failed.includes("term-in-query-key")) {
      console.error("SELFTEST FAIL: not caught", caught.message);
      process.exit(1);
    }
    console.log("  caught: query key");
  } finally {
    writeFileSync(FILE, original, "utf8");
  }
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}

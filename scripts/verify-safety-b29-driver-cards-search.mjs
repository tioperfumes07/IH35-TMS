#!/usr/bin/env node
/** SAF-B29 — Driver Safety Cards roster must server-search (not silent 200-cap). */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const FILE = join(ROOT, "apps/frontend/src/components/safety/DriverSafetyCards.tsx");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

export function run(plantedText) {
  const s = strip(plantedText ?? readFileSync(FILE, "utf8"));
  const checks = [
    ["term-is-state", /const \[rosterSearch, setRosterSearch\] = useState/.test(s)],
    ["term-reaches-server", /search:\s*rosterSearch \|\| undefined/.test(s)],
    ["term-in-query-key", /queryKey:\s*\["safety-cards",\s*"drivers",\s*companyId,\s*rosterSearch\]/.test(s)],
    ["search-input", /data-testid="driver-cards-search"/.test(s)],
    ["leftover text-[11px]", !s.includes("text-[11px]")],
    ["leftover off-scale muted", !s.includes("#8A92AB") && !s.includes("#334155")],
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
  {
    const caught = run(original.replace(", rosterSearch]", "]"));
    if (caught.ok || !caught.failed.includes("term-in-query-key")) {
      console.error("SELFTEST FAIL: not caught", caught.message);
      process.exit(1);
    }
    console.log("  caught: query key");
  }
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}

import fs from "node:fs";
import path from "node:path";

export function pageSources(root) {
  const base = path.join(root, "apps/frontend/src/pages");
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) files.push(full);
    }
  };
  walk(base);
  return files.map((file) => fs.readFileSync(file, "utf8"));
}

export function countCoverage(sources, pattern) {
  return sources.filter((source) => pattern.test(source)).length;
}

export function runCoverageGuard({ label, pattern, floor, root, selftest }) {
  if (selftest) {
    const passing = Array.from({ length: floor }, () => pattern.source.replaceAll("\\b", "").split("|")[0]);
    const failing = passing.slice(0, Math.max(0, floor - 1));
    const passOk = countCoverage(passing, pattern) >= floor;
    const failCaught = countCoverage(failing, pattern) < floor;
    console.log(`  ${passOk ? "PASS" : "FAIL"}  floor count passes`);
    console.log(`  ${failCaught ? "PASS" : "FAIL"}  coverage regression fails`);
    console.log(`${label} --selftest ${Number(passOk) + Number(failCaught)}/2`);
    process.exit(passOk && failCaught ? 0 : 1);
  }
  const sources = pageSources(root);
  const count = countCoverage(sources, pattern);
  if (count < floor) {
    console.error(`${label} FAIL — coverage moved in the wrong direction: ${count} of ${sources.length} page files, required >= ${floor}; coverage may grow, never shrink`);
    process.exit(1);
  }
  console.log(`${label} PASS — ${count} of ${sources.length} page files; floor ${floor}, coverage may grow and must never shrink`);
}

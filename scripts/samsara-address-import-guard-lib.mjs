import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/integrations/samsara/geofences/address-import.service.ts";

export function runSourceGuard({ label, required, forbidden = [], selftestToken }) {
  const source = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const evaluate = (candidate) => [
    ...required.filter((token) => !candidate.includes(token)).map((token) => `missing ${token}`),
    ...forbidden.filter((token) => candidate.includes(token)).map((token) => `forbidden ${token}`),
  ];
  if (process.argv.includes("--selftest")) {
    if (!source.includes(selftestToken)) throw new Error(`${label} selftest fixture token absent`);
    const failures = evaluate(source.replace(selftestToken, "PLANTED_MUTATION"));
    if (failures.length === 0) throw new Error(`${label} planted mutation did not fail`);
    console.log(`${label} selftest PASS (planted mutation rejected)`);
    return;
  }
  const failures = evaluate(source);
  if (failures.length) {
    console.error(`${label} FAIL\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log(`${label} PASS`);
}

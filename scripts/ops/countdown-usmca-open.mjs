#!/usr/bin/env node
/**
 * Launch countdown — Excel 00-ALL-PENDING-CHECKLIST OPEN boxes.
 * Print after every merge: remaining work vs 1870-row yardstick.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const XLSX = path.join(ROOT, "docs/lockdown/USMCA-LIVE-CHROME-CERTIFY-INVENTORY-2026-08-26.xlsx");

const py = `
import openpyxl
from collections import Counter
wb = openpyxl.load_workbook(${JSON.stringify(XLSX)}, read_only=True, data_only=True)
ws = wb["00-ALL-PENDING-CHECKLIST"]
done = Counter(); lc = named = gates = n = 0
for i, r in enumerate(ws.iter_rows(values_only=True)):
    if i < 2:
        continue
    if not r or r[1] is None:
        continue
    n += 1
    mark = str(r[0] or "")
    done[mark[:24]] += 1
    cl = str(r[2] or "")
    if cl.startswith("LIVE CHROME"):
        lc += 1
    elif cl.startswith("NAMED leftover"):
        named += 1
    elif cl.startswith("LAUNCH GATE"):
        gates += 1
wb.close()
open_n = done.get("☐ OPEN", 0)
print(f"COUNTDOWN: {open_n} OPEN remaining of {n} checklist rows")
print(f"  Live Chrome leaves: {lc}")
print(f"  Named leftover cluster: {named}")
print(f"  Launch gates: {gates}")
print("  Yardstick: docs/lockdown/USMCA-LIVE-CHROME-CERTIFY-INVENTORY-2026-08-26.xlsx")
`;

const r = spawnSync("python3", ["-c", py], { encoding: "utf8", cwd: ROOT });
if (r.status !== 0) {
  process.stderr.write(r.stderr || r.stdout || "countdown failed\n");
  process.exit(r.status || 1);
}
process.stdout.write(r.stdout);

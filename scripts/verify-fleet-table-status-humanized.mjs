#!/usr/bin/env node
/**
 * Regression guard for a specific instance of the raw-status-enum-leak defect class
 * (see scripts/verify-no-raw-status-enum-in-ui.mjs): FleetTable's STATUS column resolver
 * returned `row.status` untouched, so the Fleet table printed "InService" on every row
 * instead of "In service".
 *
 * Deliberately FILE-SCOPED rather than a system-wide `.status` return classifier. A shape-only
 * regex (`case "status": return <expr>.status`) also matches `dispatchSortValue` in
 * DispatchBoard.tsx and `settlementSortValue` in SettlementsTable.tsx — both of which are
 * genuinely sort-only comparators whose actual on-screen rendering goes through a separate
 * badge/variant component, not a display leak. Flagging those would reproduce exactly the
 * "105-hit false-positive class" already documented on the work-order guard (#3755) and on
 * verify-no-raw-status-enum-in-ui.mjs's own header. This guard proves ONLY the FleetTable
 * regression stays fixed; it does not claim broader coverage.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "apps", "frontend", "src", "components", "FleetTable.tsx");

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
}

/** The `fleetSortValue` status arm must route through humanizeEnumLabel. */
export function statusCellIsHumanized(src) {
  const clean = stripComments(src);
  const m = clean.match(/case\s+"status":\s*return\s+([^\n;]+);/);
  if (!m) return { found: false, humanized: false };
  return { found: true, humanized: /humanizeEnumLabel\s*\(/.test(m[1]) };
}

function selftest() {
  const cases = [
    {
      name: "humanized status arm passes",
      src: `case "status": return row.status ? humanizeEnumLabel(row.status) : null;`,
      expect: { found: true, humanized: true },
    },
    {
      name: "the exact regression (bare row.status) is caught",
      src: `case "status": return row.status ?? null;`,
      expect: { found: true, humanized: false },
    },
    {
      name: "missing status arm entirely is reported, not silently green",
      src: `case "type": return displayType(row);`,
      expect: { found: false, humanized: false },
    },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = statusCellIsHumanized(c.src);
    const ok = got.found === c.expect.found && got.humanized === c.expect.humanized;
    if (!ok) {
      console.error(`  selftest FAIL — ${c.name}: expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(got)}`);
      bad++;
    } else {
      console.log(`  selftest OK — ${c.name}`);
    }
  }
  if (bad) {
    console.error(`SELFTEST FAIL — ${bad}/${cases.length}`);
    process.exit(1);
  }
  console.log(`verify-fleet-table-status-humanized SELFTEST OK — ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  let src;
  try {
    src = readFileSync(FILE, "utf8");
  } catch {
    console.error(`verify-fleet-table-status-humanized FAIL — ${FILE} not found`);
    process.exit(1);
  }
  const { found, humanized } = statusCellIsHumanized(src);
  if (!found) {
    console.error(
      `verify-fleet-table-status-humanized FAIL — no "status" case found in fleetSortValue; ` +
        `the resolver shape changed, re-verify by hand rather than trust a silent pass`
    );
    process.exit(1);
  }
  if (!humanized) {
    console.error(
      `verify-fleet-table-status-humanized FAIL — FleetTable's status cell returns the raw enum again ` +
        `(regressed to a bare .status read). Route it through humanizeEnumLabel().`
    );
    process.exit(1);
  }
  console.log("verify-fleet-table-status-humanized OK — FleetTable status column routes through humanizeEnumLabel");
}

main();

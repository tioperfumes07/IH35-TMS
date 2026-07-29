#!/usr/bin/env node
/**
 * When the backend says a count is DEGRADED, the UI must say so too.
 *
 * /api/v1/lists/<module>/count returns `degraded: true` + `missing_tables` when one of a module's spec
 * tables does not exist on this database — the returned count then covers only the tables that DO
 * exist. That behaviour is deliberate: the endpoint degrades instead of 500ing.
 *
 * The signal existed on the wire since LST-COUNT-01 and died at the client. The API type declared only
 * `{ count: number }`, the hook returned only `count`, and the badge rendered a bare number. So a
 * partial total was displayed as though it were complete — an authoritative-looking figure that
 * silently omitted whole tables. A number that is quietly wrong is worse than one that admits it.
 *
 * This guard asserts the whole chain carries it: API type -> hook -> badge.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CHAIN = [
  { rel: "apps/frontend/src/api/listsHub.ts", needs: ["degraded", "missing_tables"], what: "API response type" },
  { rel: "apps/frontend/src/hooks/useModuleCount.ts", needs: ["degraded", "missingTables"], what: "count hook" },
  { rel: "apps/frontend/src/pages/lists/components/DomainRowCountBadge.tsx", needs: ["degraded", "missingTables"], what: "badge" },
];

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

export function brokenLinks(read) {
  const broken = [];
  for (const link of CHAIN) {
    let src;
    try {
      src = stripComments(read(link.rel));
    } catch {
      broken.push(`${link.rel} — file missing (${link.what})`);
      continue;
    }
    const absent = link.needs.filter((n) => !src.includes(n));
    if (absent.length) broken.push(`${link.rel} (${link.what}) — does not carry: ${absent.join(", ")}`);
  }
  return broken;
}

function selftest() {
  const full = { "apps/frontend/src/api/listsHub.ts": "degraded missing_tables",
                 "apps/frontend/src/hooks/useModuleCount.ts": "degraded missingTables",
                 "apps/frontend/src/pages/lists/components/DomainRowCountBadge.tsx": "degraded missingTables" };
  const dropped = { ...full, "apps/frontend/src/hooks/useModuleCount.ts": "count only" };
  const a = brokenLinks((r) => full[r]);
  const b = brokenLinks((r) => dropped[r]);
  let bad = 0;
  if (a.length !== 0) { console.error("  selftest FAIL — complete chain reported broken"); bad++; }
  else console.log("  selftest OK — complete chain passes");
  if (b.length !== 1) { console.error(`  selftest FAIL — a dropped link was not caught (got ${b.length})`); bad++; }
  else console.log("  selftest OK — a dropped link is caught");
  if (bad) { console.error(`SELFTEST FAIL — ${bad}/2`); process.exit(1); }
  console.log("verify-degraded-count-reaches-ui SELFTEST OK — 2/2");
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const broken = brokenLinks((rel) => readFileSync(join(process.cwd(), rel), "utf8"));
  if (broken.length) {
    console.error("verify-degraded-count-reaches-ui FAIL — the degraded-count signal does not reach the UI:");
    for (const b of broken) console.error(`  ${b}`);
    console.error("\nThe backend reports a partial count. If the chain drops it, the badge shows a partial");
    console.error("total as though it were complete.");
    process.exit(1);
  }
  console.log(`verify-degraded-count-reaches-ui OK — all ${CHAIN.length} links carry the degraded signal`);
}

main();

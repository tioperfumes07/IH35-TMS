#!/usr/bin/env node
/**
 * SAF-B08 — Escrow Record must surface the server has_signed_clause gate.
 *
 * The forfeit modal already blocks when !has_signed_clause, but the list never showed the
 * field — operators saw a blocked Forfeit with no column explaining why. This guard locks the
 * list column + summary that read the server boolean (never invent a signed clause client-side).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const TAB = join(ROOT, "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx");

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const CHECKS = [
  {
    id: "column-key",
    describe: "ParityTable must declare key has_signed_clause",
    test: (s) => /key:\s*"has_signed_clause"/.test(s),
  },
  {
    id: "renders-server-boolean",
    describe: "cell must render from row.has_signed_clause (not a hardcoded true)",
    test: (s) => /row\.has_signed_clause \? "On file" : "Missing"/.test(s),
  },
  {
    id: "summary-counts-rows",
    describe: "summary must count signedClauseCount from rows.filter(has_signed_clause)",
    test: (s) =>
      /rows\.filter\(\(r\) => r\.has_signed_clause\)/.test(s) &&
      /data-testid="escrow-signed-clause-summary"/.test(s),
  },
  {
    id: "no-invented-target",
    describe: "must not reintroduce ESCROW_TARGET_DEFAULT or / 1000 accumulation math",
    test: (s) => !/ESCROW_TARGET_DEFAULT/.test(s) && !/\/\s*1000/.test(s),
  },
];

export function run() {
  const src = stripComments(readFileSync(TAB, "utf8"));
  const failed = CHECKS.filter((c) => !c.test(src));
  const ok = failed.length === 0;
  return {
    ok,
    failed: failed.map((f) => f.id),
    message: ok
      ? `PASS: Escrow Record surfaces has_signed_clause (${CHECKS.length}/${CHECKS.length}).`
      : `FAIL (${failed.length}):\n  - ${failed.map((f) => `${f.describe} (${f.id})`).join("\n  - ")}`,
  };
}

function selftest() {
  const original = readFileSync(TAB, "utf8");
  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository already red.\n${baseline.message}`);
    process.exit(1);
  }
  const cases = [
    {
      name: "column removed",
      find: 'key: "has_signed_clause"',
      replace: 'key: "has_signed_clause_REMOVED"',
      expect: "column-key",
    },
    {
      name: "summary testid removed",
      find: 'data-testid="escrow-signed-clause-summary"',
      replace: 'data-testid="escrow-signed-clause-summary-gone"',
      expect: "summary-counts-rows",
    },
  ];
  for (const c of cases) {
    if (!original.includes(c.find)) {
      console.error(`SELFTEST FAIL: anchor for "${c.name}" not found.`);
      process.exit(1);
    }
    try {
      writeFileSync(TAB, original.replace(c.find, c.replace), "utf8");
      const caught = run();
      if (caught.ok || !caught.failed.includes(c.expect)) {
        console.error(`SELFTEST FAIL: "${c.name}" was NOT caught.\n${caught.message}`);
        process.exit(1);
      }
      console.log(`  caught: ${c.name}`);
    } finally {
      writeFileSync(TAB, original, "utf8");
    }
  }
  console.log(`SELFTEST PASS: ${cases.length} planted defects caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (!result.ok) process.exit(1);
}

#!/usr/bin/env node
/**
 * DISPATCH awaiting-assignment cards (owner ruling 2026-09-04): "awaiting assignment vehicles do not
 * show vehicle number". The AwaitingTruckCard put the unit number and the "+ Book load" button on one
 * flex row with the unit under `min-w-0 truncate` and the button `shrink-0`, so a narrow lane collapsed
 * "T171" to "T.". This guard fails if the unit label regains min-w-0/truncate (which re-truncates the
 * number) or if the book button loses its own full-width line.
 *
 * Self-testing static guard. Run: node scripts/verify-dispatch-awaiting-unit-number-visible.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const original = fs.readFileSync(file, "utf8");

// Scope to the AwaitingTruckCard function body so we don't match other cards on the board.
function cardBody(s) {
  const start = s.indexOf("function AwaitingTruckCard(");
  if (start === -1) return "";
  const end = s.indexOf("\nfunction ", start + 10);
  return s.slice(start, end === -1 ? s.length : end);
}

const contracts = [
  [
    "awaiting unit label never uses min-w-0 truncate (which collapsed 'T171' to 'T.')",
    (s) => !/min-w-0 truncate text-xs font-semibold text-gray-900/.test(cardBody(s)),
    (s) => s.replace('className="whitespace-nowrap text-xs font-semibold text-gray-900"', 'className="min-w-0 truncate text-xs font-semibold text-gray-900"'),
  ],
  [
    "the + Book load button is a full-width line below the unit number (mt-1 w-full)",
    (s) => /className="mt-1 w-full rounded-sm bg-\[#1F2A44\]/.test(cardBody(s)),
    (s) => s.replace('className="mt-1 w-full rounded-sm bg-[#1F2A44]', 'className="shrink-0 rounded-sm bg-[#1F2A44]'),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-dispatch-awaiting-unit-number-visible] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    if (audit(mutate(original)).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-dispatch-awaiting-unit-number-visible] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-dispatch-awaiting-unit-number-visible] OK");

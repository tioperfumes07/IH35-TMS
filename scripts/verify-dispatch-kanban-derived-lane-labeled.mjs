#!/usr/bin/env node
/**
 * DISPATCH #16 (owner 2026-09-04): the "Loaded" Kanban lane is statuses:[] + derivedOnly —
 * it is populated ONLY by the pickup-departure telematics signal, never by a drag, and a drop
 * is refused (FAIL-K1). But the lane carried no visual cue, so operators still tried to drag
 * into it. A derivedOnly lane must be LABELED "Auto" in its header AND explain in its empty
 * state that it is telematics-set / not drag-droppable.
 *
 * Self-testing static guard. Run: node scripts/verify-...mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const original = fs.readFileSync(file, "utf8");

const contracts = [
  [
    "derivedOnly lane renders an Auto badge in its header",
    (s) => /kanban-column-auto-badge-\$\{column\.key\}/.test(s) && /column\.derivedOnly\s*\?/.test(s),
    (s) => s.replace("kanban-column-auto-badge-", "kanban-column-NO-badge-"),
  ],
  [
    "derivedOnly empty state explains it is telematics-set / not drag-droppable",
    (s) => /you can't drag a card here/.test(s),
    (s) => s.replace("you can't drag a card here", "is empty"),
  ],
  [
    "the drop handler still refuses derivedOnly drops (FAIL-K1 preserved)",
    (s) => /targetGroup\.derivedOnly/.test(s) && /set by telematics/i.test(s),
    (s) => s.replace("targetGroup.derivedOnly", "false /* removed */"),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-dispatch-kanban-derived-lane-labeled] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    if (audit(mutate(original)).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-dispatch-kanban-derived-lane-labeled] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-dispatch-kanban-derived-lane-labeled] OK");

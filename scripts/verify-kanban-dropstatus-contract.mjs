#!/usr/bin/env node
/**
 * GUARD — every dispatch Kanban lane's `dropStatus` must be a status the load-status endpoint accepts.
 *
 * WHY THIS EXISTS, and it is worth being blunt about it: CC-3 filed LV-TXN-005 claiming the board
 * rendered a "Loaded" lane whose drop the API rejected with HTTP 400. That claim was WRONG. The API
 * does reject `new_status: 'loaded'` — that part was measured correctly — but the Loaded lane never
 * sends it: the lane carries `statuses: []` and `dropStatus: "in_transit"`, so it is a visual staging
 * column whose drop is valid. The defect was inferred from one true fact plus an assumption about the
 * other end, and nobody could cheaply check the pair.
 *
 * This guard is that cheap check. It cross-references the two ends that must agree:
 *   FRONTEND  apps/frontend/src/components/dispatch/DispatchKanban.tsx  → KANBAN_STATUS_GROUPS[].dropStatus
 *   BACKEND   apps/backend/src/mdata/loads.routes.ts                    → loadStatusSchema = z.enum([...])
 *
 * A lane whose drop the endpoint rejects is a silent dead end: the dispatcher drags a card, the request
 * 400s, and the board springs back with no explanation. Today all 11 lanes are valid — this guard keeps
 * it that way when someone adds a lane or tightens the enum, which are separate files owned by separate
 * lanes and therefore drift independently.
 *
 * NOT CLAIMED: this proves the STATUS STRING is accepted by the schema. It does not prove the state
 * machine permits that particular transition from the card's current status — `validateLoadStatusWrite`
 * owns that, and a legal status can still be an illegal transition.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-kanban-dropstatus-contract";
const FE = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const BE = "apps/backend/src/mdata/loads.routes.ts";
const API = "apps/frontend/src/api/loads.ts";

export function acceptedStatuses(backendSrc) {
  const m = backendSrc.match(/const loadStatusSchema = z\.enum\(\[([\s\S]*?)\]\)/);
  if (!m) return null;
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

export function laneDrops(frontendSrc) {
  return [...frontendSrc.matchAll(/title:\s*"([^"]+)"[^}]*?dropStatus:\s*"([a-z_]+)"/g)].map((x) => ({
    lane: x[1],
    drop: x[2],
  }));
}

/**
 * THE THIRD END, added 2026-08-08 after #4769 (LV-TXN-004 FE status wire).
 *
 * #4769 changed `updateLoadStatus` so a drop with an operating company goes to the MONEY-AWARE
 * `/dispatch/loads/:id/transition` — but only if `toDispatchTransitionStatus(status)` returns non-null.
 * When it returns null the code SILENTLY falls back to `PATCH /mdata/loads/:id/status`, the path that
 * LV-TXN-015 proved stamps no departure and opens no settlement. There is no error, no log, no visible
 * difference to the dispatcher — the money simply does not happen.
 *
 * So after #4769 the two-end check above is only HALF the contract. A lane can drop a status the schema
 * happily accepts and still quietly bypass revenue recognition. This reads the mapper as DATA (CC-2 does
 * not edit loads.ts / Dispatch.tsx — Cursor owns them) and returns the set of statuses that reach the
 * money path.
 *
 * Returns null if the function cannot be parsed, so the caller refuses to pass vacuously.
 */
export function moneyPathStatuses(apiSrc) {
  const start = apiSrc.indexOf("function toDispatchTransitionStatus");
  if (start === -1) return null;
  const body = apiSrc.slice(start, apiSrc.indexOf("\n}", start));
  const events = [
    ...[...body.matchAll(/case\s+"([a-z_]+)"\s*:/g)].map((m) => ({ at: m.index, kind: "case", value: m[1] })),
    ...[...body.matchAll(/return\s+([^;]+);/g)].map((m) => ({ at: m.index, kind: "return", value: m[1].trim() })),
  ].sort((a, b) => a.at - b.at);

  const mapped = new Set();
  let pending = [];
  for (const e of events) {
    if (e.kind === "case") {
      pending.push(e.value);
      continue;
    }
    // A `return null` means those case labels do NOT reach the money path.
    if (e.value !== "null") for (const label of pending) mapped.add(label);
    pending = [];
  }
  return mapped.size === 0 ? null : mapped;
}

/**
 * Statuses that may legitimately skip the money-aware path, with the reason stated. These are
 * PRE-DISPATCH lanes: nothing has moved, so there is no revenue to recognise and no settlement to open.
 * This list is deliberately EXPLICIT — the whole point is that skipping the money path must be a decision
 * somebody wrote down, never the silent default for anything a future author forgets to map.
 */
const MONEY_FREE_PRE_DISPATCH = new Set(["planned", "booked"]);

/**
 * LV-KANBAN-DROP-SWALLOWED-REJECTION (2026-08-08, INVERTED — read the history, it matters).
 *
 * This assertion previously demanded the OPPOSITE: that `onStatusDrop` in Dispatch.tsx contain a try/catch.
 * That was wrong and it shipped (#4788). `DispatchKanban` is the ONLY consumer of this prop and it already
 * wraps the call (DispatchKanban.tsx:661-668): on rejection it REVERTS its optimistic move and shows
 * "Status change rejected by server. Reverted." Catching upstream without re-throwing makes the promise
 * resolve, so that revert never runs — the card stays in the lane the server REJECTED and the Kanban fires
 * its SUCCESS toast on a failed write. A guard that requires the swallow enforces the bug.
 *
 * So the rule is inverted: the drop handler must let the rejection PROPAGATE. A catch is permitted only if it
 * re-throws (or returns a rejected promise), because the optimistic state lives in the consumer and only the
 * consumer can roll it back.
 */
export function auditDropErrorHandling(rawPageSrc) {
  const problems = [];
  // Strip comments FIRST. The handler's own comment explains why a try/catch must not be added here, and a
  // naive scan flagged the word "catch" inside that explanation — the guard failing on the very text that
  // documents the rule. Same comment-stripping the sibling guards in this repo already do.
  const pageSrc = rawPageSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const m = pageSrc.match(/onStatusDrop=\{async \([^)]*\) => \{([\s\S]*?)\n\s*\}\}/);
  if (!m) {
    problems.push(`onStatusDrop handler not found in the dispatch page — refusing to pass vacuously.`);
    return problems;
  }
  const body = m[1];
  if (/\bcatch\b/.test(body) && !/\bthrow\b/.test(body)) {
    problems.push(
      `onStatusDrop swallows the rejection: it catches without re-throwing. DispatchKanban owns this failure ` +
        `path (it reverts its optimistic move and toasts "rejected by server"); swallowing here makes the ` +
        `promise resolve, so the card KEEPS the status the server refused and the Kanban shows SUCCESS. ` +
        `Let it propagate (LV-KANBAN-DROP-SWALLOWED-REJECTION — this is what #4788 got backwards).`,
    );
  }
  return problems;
}

/**
 * LV-KANBAN-SYNTHETIC-CARD-INERT-DRAG (2026-08-08). A card that cannot be dropped must not offer a drag
 * affordance.
 *
 * Truck-without-a-load cards are injected with id "unit:<id>" and `status: "unassigned"`. `canDragLoad` only
 * excludes cancelled/closed/paid/invoiced, so those cards were draggable: full listeners plus `cursor-grab`.
 * But handleDragEnd resolves the id against `loads`, finds nothing, and returns — so every drop was silently
 * discarded. The dispatcher could drag a truck across the board into any lane and get no movement, no toast
 * and no reason. This asserts the affordance is gated on the card being a real load.
 */
export function auditSyntheticCardNotDraggable(kanbanSrc) {
  const problems = [];
  const src = kanbanSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/isSyntheticKanbanCardId/.test(src)) {
    problems.push(
      `DispatchKanban.tsx: no isSyntheticKanbanCardId predicate. Synthetic "unit:" truck cards are not loads ` +
        `and can never be status-dropped, so they must not render a drag affordance ` +
        `(LV-KANBAN-SYNTHETIC-CARD-INERT-DRAG).`,
    );
    return problems;
  }
  const sites = [...src.matchAll(/const\s+draggableEnabled\s*=\s*([^;]+);/g)].map((m) => m[1]);
  if (sites.length === 0) {
    problems.push(`DispatchKanban.tsx: no draggableEnabled sites found — refusing to pass vacuously.`);
    return problems;
  }
  sites.forEach((expr, i) => {
    if (!/isSyntheticKanbanCardId/.test(expr)) {
      problems.push(
        `DispatchKanban.tsx: draggableEnabled site #${i + 1} does not exclude synthetic cards, so a truck ` +
          `card renders as draggable and every drop is silently discarded.`,
      );
    }
  });
  return problems;
}

export function audit(frontendSrc, backendSrc, apiSrc) {
  const accepted = acceptedStatuses(backendSrc);
  if (!accepted || accepted.length === 0) {
    return [`${BE}: could not read loadStatusSchema z.enum — refusing to pass vacuously.`];
  }
  const lanes = laneDrops(frontendSrc);
  if (lanes.length === 0) {
    return [`${FE}: found ZERO Kanban lanes with a dropStatus — scope is wrong, refusing to pass vacuously.`];
  }
  const problems = lanes
    .filter((l) => !accepted.includes(l.drop))
    .map(
      (l) =>
        `${FE}: lane "${l.lane}" drops to "${l.drop}", which loadStatusSchema does not accept. ` +
        `Dragging a card there 400s and the board springs back with no explanation. ` +
        `Accepted: ${accepted.join(", ")}.`,
    );

  // apiSrc is optional so existing two-argument callers/selftests keep working.
  if (apiSrc === undefined) return problems;

  const moneyPath = moneyPathStatuses(apiSrc);
  if (!moneyPath) {
    problems.push(`${API}: could not parse toDispatchTransitionStatus — refusing to pass vacuously.`);
    return problems;
  }
  for (const l of lanes) {
    if (moneyPath.has(l.drop) || MONEY_FREE_PRE_DISPATCH.has(l.drop)) continue;
    problems.push(
      `${API}: lane "${l.lane}" drops to "${l.drop}", which toDispatchTransitionStatus does NOT map. ` +
        `It returns null, so updateLoadStatus silently falls back to PATCH /mdata/loads/:id/status — the ` +
        `path LV-TXN-015 proved stamps no departure and opens no settlement. The drag appears to succeed ` +
        `and the money never happens. Either map "${l.drop}" in toDispatchTransitionStatus, or add it to ` +
        `MONEY_FREE_PRE_DISPATCH in this guard WITH a written reason why that lane has no money effect.`,
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const be = `const loadStatusSchema = z.enum([\n  "assigned",\n  "in_transit",\n  "delivered_pending_docs",\n]);`;
  const good = `{ key: "a", title: "Assigned", statuses: ["assigned"], dropStatus: "assigned" },
                { key: "b", title: "Loaded", statuses: [], dropStatus: "in_transit" },`;
  const bad = `{ key: "b", title: "Loaded", statuses: [], dropStatus: "loaded" },`;
  // The money-path mapper, in the shape #4769 actually wrote it: a fall-through group returning the
  // status unchanged, a remap, and a `default: return null` that is the SILENT bypass.
  const apiGood = `function toDispatchTransitionStatus(status) {
    switch (status) {
      case "in_transit":
      case "delivered_pending_docs":
        return status;
      case "assigned":
        return "assigned_not_dispatched";
      default:
        return null;
    }
  }`;
  // Same mapper with in_transit demoted to an explicit null — the exact silent-bypass regression.
  const apiDropsInTransit = `function toDispatchTransitionStatus(status) {
    switch (status) {
      case "delivered_pending_docs":
        return status;
      case "in_transit":
        return null;
      case "assigned":
        return "assigned_not_dispatched";
      default:
        return null;
    }
  }`;
  const preDispatch = `{ key: "p", title: "Awaiting assignment", statuses: [], dropStatus: "planned" },`;
  const beWithPlanned = `const loadStatusSchema = z.enum([\n  "assigned",\n  "in_transit",\n  "delivered_pending_docs",\n  "planned",\n]);`;

  const cases = [
    ["all lanes valid", good, be, undefined, 0],
    ["a lane dropping to a rejected status", bad, be, undefined, 1],
    ["both a valid and an invalid lane", good + bad, be, undefined, 1],
    ["backend enum unreadable", good, "const somethingElse = 1;", undefined, 1],
    ["no lanes found — must not pass vacuously", "", be, undefined, 1],
    ["money path: every lane maps", good, be, apiGood, 0],
    ["MONEY BAR — a lane silently bypasses the money path (returns null)", good, be, apiDropsInTransit, 1],
    ["money path: pre-dispatch lane is an explicit allowed exception", preDispatch, beWithPlanned, apiGood, 0],
    ["money path: mapper unparseable — must not pass vacuously", good, be, "const nope = 1;", 1],
  ];
  const syntheticCases = [
    ["all draggable sites exclude synthetic cards", `export function isSyntheticKanbanCardId(id){return id.startsWith("unit:")}\nconst draggableEnabled = canDragLoad(load.status) && !isSyntheticKanbanCardId(load.id);\nconst draggableEnabled = canDragLoad(load.status) && !isSyntheticKanbanCardId(load.id);`, 0],
    ["REGRESSION BAR — a site forgets the synthetic exclusion (the shipped defect)", `export function isSyntheticKanbanCardId(id){return id.startsWith("unit:")}\nconst draggableEnabled = canDragLoad(load.status) && !isSyntheticKanbanCardId(load.id);\nconst draggableEnabled = canDragLoad(load.status);`, 1],
    ["predicate removed entirely", `const draggableEnabled = canDragLoad(load.status);`, 1],
    ["no draggable sites — must not pass vacuously", `export function isSyntheticKanbanCardId(id){return false}`, 1],
  ];
  const dropCases = [
    ["propagating handler (correct — Kanban reverts)", `onStatusDrop={async (id, nextStatus) => {\n await statusMutation.mutateAsync({ id });\n }}`, 0],
    ["REGRESSION BAR — catch without re-throw (what #4788 shipped)", `onStatusDrop={async (id, nextStatus) => {\n try { await m(); } catch (e) { pushToast(\`x\`, "error"); }\n }}`, 1],
    ["catch that re-throws is allowed", `onStatusDrop={async (id, nextStatus) => {\n try { await m(); } catch (e) { log(e); throw e; }\n }}`, 0],
    ["handler missing — must not pass vacuously", `no handler here`, 1],
  ];
  let failed = 0;
  for (const [name, kanbanSrc, want] of syntheticCases) {
    const got = auditSyntheticCardNotDraggable(kanbanSrc).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }
  for (const [name, pageSrc, want] of dropCases) {
    const got = auditDropErrorHandling(pageSrc).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }
  for (const [name, fe, beSrc, apiSrc, want] of cases) {
    const got = audit(fe, beSrc, apiSrc).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length + dropCases.length + syntheticCases.length} mutations detected correctly`);
  process.exit(0);
}

for (const rel of [FE, BE, API]) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`${LABEL} FAIL — missing ${rel}; scope is wrong, refusing to pass vacuously.`);
    process.exit(1);
  }
}

const feSrc = fs.readFileSync(path.join(ROOT, FE), "utf8");
const PAGE = "apps/frontend/src/pages/Dispatch.tsx";
const problems = [
  ...audit(feSrc, fs.readFileSync(path.join(ROOT, BE), "utf8"), fs.readFileSync(path.join(ROOT, API), "utf8")),
  ...auditDropErrorHandling(fs.readFileSync(path.join(ROOT, PAGE), "utf8")),
  ...auditSyntheticCardNotDraggable(feSrc),
];
if (problems.length) {
  console.error(`${LABEL} FAIL — a Kanban lane drops to a status the API rejects, or one that silently skips the money path:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nFix: change the lane's dropStatus, add the status to loadStatusSchema if it is genuinely valid, or map it in toDispatchTransitionStatus.\n`);
  process.exit(1);
}

const lanes = laneDrops(feSrc);
console.log(
  `${LABEL} OK — all ${lanes.length} Kanban lane drops are accepted by loadStatusSchema, and each either reaches the money-aware transition or is an explicit pre-dispatch exception.`,
);
process.exit(0);

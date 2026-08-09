#!/usr/bin/env node
/**
 * LOAD-WO-REVERSE ratchet — the dispatch load drawer must show that load's work orders.
 *
 * `maintenance.work_orders.load_id` has always been written, and G18 makes it mandatory for every
 * diesel/roadside expense — but nothing could ASK for a load's work orders, so the drawer had no
 * way to show them. Live prove: load L-20260808-0085 carries TWO work orders whose `load_id` points
 * at it and the drawer rendered neither; `LoadDetailDrawer` did not contain the string "work order".
 *
 * Four things have to hold together or the block silently lies:
 *   1. the route accepts `load_id`                → otherwise the param is ignored
 *   2. the route FILTERS on it                    → otherwise it returns every WO in the company
 *   3. the load-scoped read is NOT open-only      → otherwise completed repairs vanish from history
 *   4. the drawer mounts the section              → otherwise none of the above reaches a screen
 * Each failure mode reads as "no bug" on screen, which is how the original gap survived.
 *
 * Static only — no DB, no network, no build. Runs in well under a second.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const ROUTE = "apps/backend/src/maintenance/work-orders.routes.ts";
const CLIENT = "apps/frontend/src/api/maintenance.ts";
const SECTION = "apps/frontend/src/components/dispatch/LoadWorkOrdersReverseSection.tsx";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

const read = (rel) => stripComments(readFileSync(join(repoRoot, rel), "utf8"));

const failures = [];

const route = read(ROUTE);
if (!/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(route)) {
  failures.push(`${ROUTE}: listQuerySchema must accept an optional \`load_id\` uuid.`);
}
if (!/where\.push\(`w\.load_id = \$\$\{values\.length\}`\)/.test(route)) {
  failures.push(`${ROUTE}: \`load_id\` is accepted but never filtered on — the route would return every work order in the company.`);
}
if (!/q\.equipment_id \|\| q\.load_id/.test(route)) {
  failures.push(
    `${ROUTE}: a load-scoped read must bypass the open-only default (join \`q.load_id\` to the caller-controlled-scope branch) — otherwise completed repairs disappear from the load's history.`
  );
}

const client = read(CLIENT);
if (!/load_id\?:\s*string/.test(client) || !/qs\.set\(\s*["']load_id["']/.test(client)) {
  failures.push(`${CLIENT}: listWorkOrdersFiltered must accept \`load_id\` AND put it on the query string.`);
}

const section = read(SECTION);
if (!/listWorkOrdersFiltered\s*\(/.test(section) || !/load_id:\s*loadId/.test(section)) {
  failures.push(`${SECTION}: must call listWorkOrdersFiltered with \`load_id: loadId\`.`);
}
if (!/load-reverse-work-orders/.test(section)) {
  failures.push(`${SECTION}: lost its data-testid — the reverse block is no longer addressable in tests.`);
}

const drawer = read(DRAWER);
// Anchored to the JSX element with a trailing boundary: a bare substring test also matches a typo'd
// `LoadWorkOrdersReverseSectionX`, which is exactly the mistake this check exists to catch.
if (!/<LoadWorkOrdersReverseSection(?![A-Za-z0-9_])/.test(drawer)) {
  failures.push(`${DRAWER}: does not render <LoadWorkOrdersReverseSection …/> — the load drawer shows no maintenance at all.`);
}
if (!/import\s*\{\s*LoadWorkOrdersReverseSection\s*\}/.test(drawer)) {
  failures.push(`${DRAWER}: does not import LoadWorkOrdersReverseSection.`);
}

if (failures.length > 0) {
  console.error("FAIL verify-load-reverse-work-orders");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("PASS verify-load-reverse-work-orders — load drawer lists this load's work orders, filtered server-side, closed ones included");

#!/usr/bin/env node
/**
 * verify-fact-chargebacks-entitylinks.mjs
 *
 * GUARD 2026-07-16 (audit gap #8): FACT chargeback surfaces must drill to the money
 * packet via <EntityLink kind="factoring_advance">. Plain-text advance IDs leave ops
 * unable to open the advance/invoice packet from Chargebacks & Fees.
 *
 * Static invariants (no DB, no network):
 *  1. ChargebacksTable.tsx wraps row.factoring_advance_id in EntityLink factoring_advance
 *  2. ReserveTracker.tsx chargeback history does the same (related FACT surface)
 *  3. EntityLink resolves factoring_advance → /accounting/factoring/:id
 *  4. Factoring detail route is registered in routes/manifest.tsx
 *
 * --selftest exercises assertFile() against inline pass + fail fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-chargebacks-entitylinks";

const CHARGEBACKS_TABLE = "apps/frontend/src/pages/factoring/ChargebacksTable.tsx";
const RESERVE_TRACKER = "apps/frontend/src/pages/factoring/ReserveTracker.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

/**
 * @param {string} rel
 * @param {string} src
 * @returns {string[]}
 */
export function assertChargebackSurface(rel, src) {
  const failures = [];
  if (!src.includes("EntityLink")) {
    failures.push(`${rel}: must import/render EntityLink`);
  }
  if (!/kind\s*=\s*["']factoring_advance["']/.test(src)) {
    failures.push(`${rel}: must render EntityLink kind="factoring_advance"`);
  }
  if (!/id\s*=\s*\{\s*row\.factoring_advance_id\s*\}/.test(src)) {
    failures.push(`${rel}: EntityLink id must be row.factoring_advance_id`);
  }
  // Bare advance id as a table cell child (the audit gap #8 defect).
  // Allow id= props and getRowId / key expressions — only flag JSX text-ish `{row.factoring_advance_id}`.
  const bareCell = /<(?:td|th|span|div|p)\b[^>]*>\s*\{\s*row\.factoring_advance_id(?:\.[a-zA-Z0-9_]+)?\s*\}/m;
  if (bareCell.test(src)) {
    failures.push(
      `${rel}: must not render factoring_advance_id as plain text in a cell — wrap with EntityLink`,
    );
  }
  return failures;
}

/**
 * @param {string} entityLinkSrc
 * @param {string} manifestSrc
 * @returns {string[]}
 */
export function assertResolverAndRoute(entityLinkSrc, manifestSrc) {
  const failures = [];
  if (!/case\s+["']factoring_advance["']\s*:\s*return\s+`\/accounting\/factoring\/\$\{id\}`/.test(entityLinkSrc)) {
    failures.push(
      `${ENTITY_LINK}: resolveEntityRoute(factoring_advance) must return /accounting/factoring/:id`,
    );
  }
  if (!/path\s*=\s*["']\/accounting\/factoring\/:id["']/.test(manifestSrc)) {
    failures.push(`${MANIFEST}: must register /accounting/factoring/:id detail route`);
  }
  return failures;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function runSelftest() {
  const passSrc = `
import { EntityLink } from "../../components/shared/EntityLink";
export function T({ rows }) {
  return rows.map((row) => (
    <td>
      <EntityLink kind="factoring_advance" id={row.factoring_advance_id} label={row.statement_reference} />
    </td>
  ));
}
`;
  const failPlain = `
export function T({ rows }) {
  return rows.map((row) => (
    <td>{row.factoring_advance_id}</td>
  ));
}
`;
  const failMissingKind = `
import { EntityLink } from "../../components/shared/EntityLink";
export function T({ rows }) {
  return rows.map((row) => (
    <td><EntityLink kind="invoice" id={row.factoring_advance_id} /></td>
  ));
}
`;

  let fails = 0;
  const passFails = assertChargebackSurface("fixture-pass", passSrc);
  if (passFails.length) {
    console.error(`${LABEL} --selftest: expected pass fixture to succeed, got:`, passFails);
    fails += 1;
  }
  const plainFails = assertChargebackSurface("fixture-plain", failPlain);
  if (plainFails.length < 2) {
    console.error(`${LABEL} --selftest: expected plain-id fixture to fail hard, got:`, plainFails);
    fails += 1;
  }
  const kindFails = assertChargebackSurface("fixture-kind", failMissingKind);
  if (!kindFails.some((f) => f.includes('kind="factoring_advance"'))) {
    console.error(`${LABEL} --selftest: expected wrong-kind fixture to flag kind, got:`, kindFails);
    fails += 1;
  }

  const resolverOk = assertResolverAndRoute(
    `case "factoring_advance":\n      return \`/accounting/factoring/\${id}\`;`,
    `path="/accounting/factoring/:id"`,
  );
  if (resolverOk.length) {
    console.error(`${LABEL} --selftest: resolver pass fixture failed:`, resolverOk);
    fails += 1;
  }
  const resolverBad = assertResolverAndRoute(`case "load": return "/x";`, `path="/other"`);
  if (resolverBad.length < 2) {
    console.error(`${LABEL} --selftest: resolver fail fixture under-flagged:`, resolverBad);
    fails += 1;
  }

  if (fails) {
    console.error(`${LABEL} --selftest: FAIL (${fails})`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: OK`);
  process.exit(0);
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }

  const failures = [];

  for (const rel of [CHARGEBACKS_TABLE, RESERVE_TRACKER]) {
    const src = read(rel);
    if (src == null) {
      failures.push(`MISSING ${rel}`);
      continue;
    }
    failures.push(...assertChargebackSurface(rel, src));
  }

  const entityLink = read(ENTITY_LINK);
  const manifest = read(MANIFEST);
  if (entityLink == null) failures.push(`MISSING ${ENTITY_LINK}`);
  if (manifest == null) failures.push(`MISSING ${MANIFEST}`);
  if (entityLink && manifest) {
    failures.push(...assertResolverAndRoute(entityLink, manifest));
  }

  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(
    `${LABEL}: OK — ChargebacksTable + ReserveTracker advance IDs use EntityLink factoring_advance`,
  );
  process.exit(0);
}

main();

#!/usr/bin/env node
/**
 * 0441-mod6-insurance-no-driver-accident-link
 *
 * Asserts ClaimsTab reverse-graph renderer maps accidents + incidents into
 * visible links (same contract as lawsuits/matters), not only empty-state length checks.
 *
 * C-01 / FAIL-CLAIM-ACCIDENT-DEEPLINK (2026-08-09): bare `/safety/accidents` is NOT enough —
 * AccidentsPage only opens the drawer when `?accident_id=` is present (EntityLink kind=accident).
 *
 * Self-test: node scripts/verify-insurance-claims-reverse-accident-incident.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-insurance-claims-reverse-accident-incident";
const CLAIMS_TAB = path.join(ROOT, "apps/frontend/src/pages/insurance/ClaimsTab.tsx");

const REVERSE_KEYS = ["accidents", "lawsuits", "matters", "incidents"];

/**
 * @param {string} source
 * @returns {string[]}
 */
export function computeFailures(source) {
  const errors = [];
  if (!source || !source.trim()) {
    return ["ClaimsTab.tsx is missing or empty"];
  }

  for (const key of REVERSE_KEYS) {
    const lengthRef = new RegExp(`graph\\.reverse\\.${key}\\.length`);
    const mapRef = new RegExp(`graph\\.reverse\\.${key}\\.map\\s*\\(`);
    if (lengthRef.test(source) && !mapRef.test(source)) {
      errors.push(
        `graph.reverse.${key} is referenced by length (empty-state) but never .map()'d into visible reverse links`,
      );
    }
  }

  if (!/graph\.reverse\.accidents\.map\s*\(/.test(source)) {
    errors.push("ClaimsTab must .map() graph.reverse.accidents into visible reverse-drill links");
  }
  if (!/graph\.reverse\.incidents\.map\s*\(/.test(source)) {
    errors.push("ClaimsTab must .map() graph.reverse.incidents into visible reverse-drill links");
  }
  // Deep link into AccidentsPage drawer — bare /safety/accidents is a dead hop.
  const accidentDeep =
    /kind=["']accident["']/.test(source) ||
    /to=\{?[`'"]\/safety\/accidents\?accident_id=/.test(source);
  if (!accidentDeep) {
    errors.push(
      "accident links must deep-link via EntityLink kind=\"accident\" or /safety/accidents?accident_id= (drawer open)",
    );
  }
  if (/to=["']\/safety\/accidents["']/.test(source)) {
    errors.push("bare to=\"/safety/accidents\" is forbidden — AccidentsPage needs ?accident_id=");
  }
  if (!/claim-reverse-accident-/.test(source)) {
    errors.push("accident reverse links must expose data-testid claim-reverse-accident-*");
  }
  if (!/claim-reverse-incident-/.test(source)) {
    errors.push("incident reverse links must expose data-testid claim-reverse-incident-*");
  }

  return errors;
}

function selftest() {
  const good = `
    {graph.reverse.lawsuits.map((l) => <span key={l.id}>Lawsuit {l.case_number}</span>)}
    {graph.reverse.matters.map((m) => <EntityLink key={m.id} kind="matter" id={m.id} />)}
    {graph.reverse.accidents.map((a) => (
      <EntityLink key={a.id} kind="accident" id={a.id} data-testid={\`claim-reverse-accident-\${a.id}\`} />
    ))}
    {graph.reverse.incidents.map((i) => (
      <Link key={i.id} to="/safety/damage-reports" data-testid={\`claim-reverse-incident-\${i.id}\`}>
        Incident {i.id.slice(0, 8)}
      </Link>
    ))}
    {graph.reverse.accidents.length === 0 &&
    graph.reverse.lawsuits.length === 0 &&
    graph.reverse.matters.length === 0 &&
    graph.reverse.incidents.length === 0
      ? "none linked yet"
      : null}
  `;

  const badBare = `
    {graph.reverse.lawsuits.map((l) => <span key={l.id}>Lawsuit {l.case_number}</span>)}
    {graph.reverse.matters.map((m) => <EntityLink key={m.id} kind="matter" id={m.id} />)}
    {graph.reverse.accidents.map((a) => (
      <Link key={a.id} to="/safety/accidents" data-testid={\`claim-reverse-accident-\${a.id}\`}>
        Accident {a.id.slice(0, 8)}
      </Link>
    ))}
    {graph.reverse.incidents.map((i) => (
      <Link key={i.id} to="/safety/damage-reports" data-testid={\`claim-reverse-incident-\${i.id}\`}>
        Incident {i.id.slice(0, 8)}
      </Link>
    ))}
  `;

  const bad = `
    {graph.reverse.lawsuits.map((l) => <span key={l.id}>Lawsuit {l.case_number}</span>)}
    {graph.reverse.matters.map((m) => <EntityLink key={m.id} kind="matter" id={m.id} />)}
    {graph.reverse.accidents.length === 0 &&
    graph.reverse.lawsuits.length === 0 &&
    graph.reverse.matters.length === 0 &&
    graph.reverse.incidents.length === 0
      ? "none linked yet"
      : null}
  `;

  const goodFails = computeFailures(good);
  if (goodFails.length > 0) {
    console.error(`${LABEL} --selftest FAIL: good corpus rejected: ${goodFails.join("; ")}`);
    process.exit(1);
  }
  const bareFails = computeFailures(badBare);
  if (bareFails.length === 0) {
    console.error(`${LABEL} --selftest FAIL: bare /safety/accidents unexpectedly passed`);
    process.exit(1);
  }
  const badFails = computeFailures(bad);
  if (badFails.length === 0) {
    console.error(`${LABEL} --selftest FAIL: bad corpus unexpectedly passed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const source = fs.existsSync(CLAIMS_TAB) ? fs.readFileSync(CLAIMS_TAB, "utf8") : "";
  const failures = computeFailures(source);
  if (failures.length > 0) {
    for (const msg of failures) {
      console.error(`${LABEL} FAIL: ${msg}`);
    }
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();

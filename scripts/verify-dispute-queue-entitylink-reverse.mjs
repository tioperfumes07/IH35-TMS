#!/usr/bin/env node
/**
 * Rule-17: dispute queue reverse drill — driver + settlement EntityLinks (Law §9).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispute-queue-entitylink-reverse";
const PAGE = "apps/frontend/src/pages/accounting/DisputeQueuePage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertDisputeQueueEntityLink({
  page = read(PAGE),
  manifest = read("apps/frontend/src/routes/manifest.tsx"),
} = {}) {
  const errors = [];

  if (!/from "\.\.\/\.\.\/components\/shared\/EntityLink"/.test(page)) {
    errors.push(`${PAGE}: must import EntityLink`);
  }
  if (!/kind="settlement"/.test(page) || !/row\.settlement_id/.test(page)) {
    errors.push(`${PAGE}: settlement column must EntityLink row.settlement_id`);
  }
  if (!/kind="driver"/.test(page) || !/row\.driver_id/.test(page)) {
    errors.push(`${PAGE}: driver column must EntityLink row.driver_id`);
  }
  if (!/data-testid="dispute-queue-driver-link"/.test(page)) {
    errors.push(`${PAGE}: driver reverse marker missing`);
  }
  if (!/\/accounting\/dispute-queue/.test(manifest)) {
    errors.push("manifest: /accounting/dispute-queue route missing");
  }
  return errors;
}

function selftest() {
  const goodPage = `
    import EntityLink from "../../components/shared/EntityLink";
    <EntityLink kind="settlement" id={row.settlement_id} />
    <EntityLink kind="driver" id={row.driver_id} data-testid="dispute-queue-driver-link" />
  `;
  const manifest = `<Route path="/accounting/dispute-queue" />`;
  const plantedPage = goodPage.replace(
    '<EntityLink kind="driver" id={row.driver_id} data-testid="dispute-queue-driver-link" />',
    `<span>{row.driver_name ?? row.driver_id.slice(0, 8)}</span>`,
  );
  const goodErrors = assertDisputeQueueEntityLink({ page: goodPage, manifest });
  const plantedErrors = assertDisputeQueueEntityLink({ page: plantedPage, manifest });
  if (goodErrors.length !== 0 || !plantedErrors.some((error) => error.includes("driver column"))) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertDisputeQueueEntityLink();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);

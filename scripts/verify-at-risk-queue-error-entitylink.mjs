#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["customer","driver","unit","load","connectivity","reverse_link"],"leafRe":"^queues\\.at_risk$","task":"CLS-DISPATCH-AT-RISK-FK-LINKS"} */
/**
 * verify-at-risk-queue-error-entitylink.mjs
 *
 * systemic-pattern-mandatory-error-states + EntityLink (one surface):
 * AtRiskQueuePage must:
 *  1. Surface loadsQ failures via ListErrorState (not false-empty "No at-risk loads")
 *  2. Render canonical FK-backed EntityLinks for load/customer/driver/unit
 *
 * Rule 17 — verify-step only (no package.json / locked-guards / ci.yml).
 *
 * Usage:
 *   node scripts/verify-at-risk-queue-error-entitylink.mjs
 *   node scripts/verify-at-risk-queue-error-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-at-risk-queue-error-entitylink";

const FILES = {
  page: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
  test: "apps/frontend/src/pages/dispatch/__tests__/AtRiskQueuePage.test.tsx",
  step: "scripts/verify-steps/1033-verify-at-risk-queue-error-entitylink.mjs",
};

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check(sources) {
  const failures = [];
  const { page, test, step } = sources;

  if (!page) failures.push(`${FILES.page}: missing`);
  else {
    if (!/ListErrorState/.test(page)) {
      failures.push(`${FILES.page}: must import/render ListErrorState on query failure`);
    }
    if (!/Couldn't load at-risk queue/.test(page)) {
      failures.push(`${FILES.page}: must use ListErrorState title "Couldn't load at-risk queue"`);
    }
    if (!/loadsQ\.isError/.test(page)) {
      failures.push(`${FILES.page}: must gate error UI on loadsQ.isError`);
    }
    if (!/loadsQ\.refetch/.test(page)) {
      failures.push(`${FILES.page}: ListErrorState onRetry must call loadsQ.refetch`);
    }
    if (!/EntityLinkOrTombstone/.test(page) || !/kind\s*=\s*["']load["'][\s\S]{0,80}name=\{load\.load_number\}[\s\S]{0,80}noun="Load"/.test(page)) {
      failures.push(`${FILES.page}: must render resolved load link or unavailable tombstone`);
    }
    for (const [kind, id, name, noun] of [["customer", "customer_id", "customer_name", "Customer"], ["driver", "driver_id", "driver_name", "Driver"], ["unit", "unit_id", "unit_number", "Unit"]]) {
      const linkRe = new RegExp(`kind\\s*=\\s*["']${kind}["'][\\s\\S]{0,80}id=\\{load\\.${id}\\}[\\s\\S]{0,80}name=\\{load\\.${name}\\}[\\s\\S]{0,80}noun="${noun}"`);
      if (!linkRe.test(page)) failures.push(`${FILES.page}: must render resolved ${kind} link or unavailable tombstone from load.${id}`);
    }
    if (/to=\{`\/dispatch\?load_id=/.test(page) || /to="\/dispatch\?load_id=/.test(page)) {
      failures.push(`${FILES.page}: must not use ad-hoc /dispatch?load_id= Link for load cells`);
    }
    // False-empty: emptyText must not be reachable while isError is true
    if (/emptyText="No at-risk loads right now\."/.test(page) && !/loadsQ\.isError\s*\?/.test(page)) {
      failures.push(`${FILES.page}: emptyText must be behind loadsQ.isError ternary (false-empty)`);
    }
  }

  if (!test) failures.push(`${FILES.test}: missing`);
  else {
    if (!/Couldn't load at-risk queue/.test(test)) {
      failures.push(`${FILES.test}: must assert ListErrorState title on failure`);
    }
    if (!/No at-risk or late loads right now\./.test(test)) {
      failures.push(`${FILES.test}: must prove emptyText is absent on error / present after retry`);
    }
    if (!/Retry/.test(test)) {
      failures.push(`${FILES.test}: must exercise Retry / refetch path`);
    }
    if (!/\/dispatch\/loads\//.test(test) && !/EntityLink/.test(test)) {
      failures.push(`${FILES.test}: must cover EntityLink load href or EntityLink render`);
    }
  }

  if (!step) failures.push(`${FILES.step}: missing`);
  else if (!/verify-at-risk-queue-error-entitylink\.mjs/.test(step)) {
    failures.push(`${FILES.step}: must run scripts/verify-at-risk-queue-error-entitylink.mjs`);
  }

  return failures;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

if (process.argv.includes("--selftest")) {
  const badPage = `
    export function AtRiskQueuePage() {
      const loads = loadsQ.data?.loads ?? [];
      return (
        <ParityTable
          rows={loads}
          emptyText="No at-risk loads right now."
          columns={[{ render: (load) => <Link to={\`/dispatch?load_id=\${load.id}\`}>{load.load_number}</Link> }]}
        />
      );
    }
  `;
  const goodPage = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
    {loadsQ.isError ? (
      <ListErrorState title="Couldn't load at-risk queue" status={0} message={msg} onRetry={() => void loadsQ.refetch()} />
    ) : (
      <ParityTable emptyText="No at-risk loads right now." columns={[
        { render: (load) => <EntityLinkOrTombstone kind="load" id={load.id} name={load.load_number} noun="Load" /> },
        { render: (load) => <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" /> },
        { render: (load) => <EntityLinkOrTombstone kind="driver" id={load.driver_id} name={load.driver_name} noun="Driver" /> },
        { render: (load) => <EntityLinkOrTombstone kind="unit" id={load.unit_id} name={load.unit_number} noun="Unit" /> },
      ]} />
    )}
  `;
  const goodTest = `
    expect(await screen.findByText("Couldn't load at-risk queue")).toBeTruthy();
    expect(screen.queryByText("No at-risk or late loads right now.")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    expect(await screen.findByText("No at-risk or late loads right now.")).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/dispatch/loads/load-1");
    expect(customerLink.getAttribute("href")).toBe("/customers/customer-1");
    expect(driverLink.getAttribute("href")).toBe("/drivers/driver-1");
    expect(unitLink.getAttribute("href")).toBe("/fleet/units/unit-1");
  `;
  const goodStep = `ctx.run("node", ["scripts/verify-at-risk-queue-error-entitylink.mjs"]);`;

  if (check({ page: badPage, test: "", step: "" }).length === 0) {
    console.error(`${LABEL} --selftest FAIL: bad fixture accepted`);
    process.exit(1);
  }
  const goodFailures = check({ page: goodPage, test: goodTest, step: goodStep });
  if (goodFailures.length > 0) {
    console.error(`${LABEL} --selftest FAIL: good fixture rejected`);
    console.error(goodFailures);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = check({
  page: read(FILES.page),
  test: read(FILES.test),
  step: read(FILES.step),
});

if (failures.length > 0) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`${LABEL} PASS`);

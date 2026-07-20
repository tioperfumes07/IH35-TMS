#!/usr/bin/env node
/**
 * verify-late-arrivals-error-entitylink.mjs
 *
 * LateArrivalsPage must:
 *  1. Surface query failures via ListErrorBanner (not collapse to empty-table "No late arrivals").
 *  2. Drill load rows through EntityLink kind="load" (canonical /dispatch/loads/:id).
 *
 * Rule 17 — verify-step only (no package.json / locked-guards / ci.yml).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-late-arrivals-error-entitylink";
const PAGE = "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx";
const TEST = "apps/frontend/src/pages/dispatch/__tests__/LateArrivalsPage.test.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";

/** @param {{ page: string, test: string, entityLink: string }} src */
export function checkSources({ page, test, entityLink }) {
  const failures = [];

  if (!page.includes('from "../../components/shared/ListErrorBanner"')) {
    failures.push(`${PAGE}: must import ListErrorBanner`);
  }
  if (!/message=["']Failed to load late arrivals\.["']/.test(page)) {
    failures.push(`${PAGE}: must use ListErrorBanner message "Failed to load late arrivals."`);
  }
  if (!/lateQ\.isError/.test(page)) {
    failures.push(`${PAGE}: must gate banner / table on lateQ.isError`);
  }
  if (!/!lateQ\.isError\s*\?/.test(page) && !/\{\s*!lateQ\.isError\s*\?/.test(page)) {
    failures.push(`${PAGE}: must hide ParityTable when lateQ.isError (no false-empty emptyText)`);
  }

  if (!page.includes('from "../../components/shared/EntityLink"')) {
    failures.push(`${PAGE}: must import EntityLink`);
  }
  if (!/kind\s*=\s*["']load["']/.test(page)) {
    failures.push(`${PAGE}: must render EntityLink kind="load"`);
  }
  if (!/id\s*=\s*\{\s*load\.id\s*\}/.test(page)) {
    failures.push(`${PAGE}: EntityLink id must be load.id`);
  }
  if (/to=\{`\/dispatch\?load_id=/.test(page) || /to=["']\/dispatch\?load_id=/.test(page)) {
    failures.push(`${PAGE}: must not use query-param /dispatch?load_id= — use EntityLink load`);
  }

  if (!/case\s+["']load["']\s*:\s*\n?\s*return\s+`\/dispatch\/loads\/\$\{id\}`/.test(entityLink) &&
      !/case "load":\s*return `\/dispatch\/loads\/\$\{id\}`/.test(entityLink)) {
    failures.push(`${ENTITY_LINK}: kind load must resolve to /dispatch/loads/:id`);
  }

  if (!test.includes("Failed to load late arrivals") || !test.includes("Refresh")) {
    failures.push(`${TEST}: must cover ListErrorBanner + Refresh on query failure`);
  }
  if (!test.includes("/dispatch/loads/") || !test.includes("late-arrival-load")) {
    failures.push(`${TEST}: must assert EntityLink href /dispatch/loads/:id`);
  }
  if (!test.includes("No late arrivals right now")) {
    failures.push(`${TEST}: must assert emptyText is not shown on error`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const badPage = `
    import { Link } from "react-router-dom";
    const loads = lateQ.data?.loads ?? [];
    <Link to={\`/dispatch?load_id=\${encodeURIComponent(load.id)}\`}>{load.load_number}</Link>
    <ParityTable emptyText="No late arrivals right now." />
  `;
  const goodPage = `
    import { EntityLink } from "../../components/shared/EntityLink";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    {lateQ.isError ? <ListErrorBanner message="Failed to load late arrivals." onRetry={() => {}} /> : null}
    {!lateQ.isError ? <ParityTable emptyText="No late arrivals right now." /> : null}
    <EntityLink kind="load" id={load.id} label={load.load_number} />
  `;
  const goodEntity = `case "load":\n      return \`/dispatch/loads/\${id}\`;`;
  const goodTest = `
    expect(await screen.findByText("Failed to load late arrivals.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refresh/i })).toBeTruthy();
    expect(screen.queryByText("No late arrivals right now.")).toBeNull();
    expect(link.getAttribute("href")).toBe("/dispatch/loads/l1");
    late-arrival-load-l1
  `;
  if (checkSources({ page: badPage, test: "", entityLink: goodEntity }).length === 0) {
    console.error(`${LABEL} --selftest FAIL: bad fixture accepted`);
    process.exit(1);
  }
  const goodFails = checkSources({ page: goodPage, test: goodTest, entityLink: goodEntity });
  if (goodFails.length) {
    console.error(`${LABEL} --selftest FAIL: good fixture rejected:\n${goodFails.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const page = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const test = fs.readFileSync(path.join(ROOT, TEST), "utf8");
const entityLink = fs.readFileSync(path.join(ROOT, ENTITY_LINK), "utf8");
const failures = checkSources({ page, test, entityLink });
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — LateArrivalsPage ListErrorBanner + EntityLink load drill-through`);
process.exit(0);

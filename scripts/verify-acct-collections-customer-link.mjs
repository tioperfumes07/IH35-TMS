#!/usr/bin/env node
/**
 * verify-acct-collections-customer-link — Collections reverse customer link (28/28).
 *
 * Root cause: CollectionTask.customer_id was available but the queue rendered plain
 * customer_name text and the detail panel had Invoice EntityLink only — no customer reverse.
 *
 * Fix: EntityLink kind=customer on queue + detail. No posting/GL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-collections-customer-link";
const PAGE = "apps/frontend/src/pages/accounting/CollectionsPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(src) {
  const errors = [];
  if (!src) {
    errors.push(`${PAGE}: missing`);
    return errors;
  }
  if (!src.includes('from "../../components/shared/EntityLink"')) {
    errors.push(`${PAGE}: must import EntityLink`);
  }
  const customerLinks = (src.match(/kind="customer"/g) || []).length;
  if (customerLinks < 2) {
    errors.push(`${PAGE}: must EntityLink kind=customer in queue AND detail (≥2)`);
  }
  if (!/task\.customer_id/.test(src)) {
    errors.push(`${PAGE}: must wire task.customer_id`);
  }
  if (/Unknown customer/.test(src) && !/kind="customer"/.test(src)) {
    errors.push(`${PAGE}: plain Unknown customer without EntityLink`);
  }
  // SELECTION CONTRACT — the defect this guard originally missed.
  // The queue row must not wrap the customer line in a stopPropagation div: that div is full-width,
  // so it swallowed clicks across the entire first line and task selection died there. It was also
  // redundant — EntityLink already calls event.stopPropagation() inside its own onClick.
  if (/onClick=\{\(event\) => event\.stopPropagation\(\)\}/.test(src.replace(/\/\*[\s\S]*?\*\//g, ""))) {
    errors.push(`${PAGE}: queue row must not wrap the customer line in a stopPropagation div — it is full-width and kills task selection; EntityLink already stops propagation`);
  }
  // <a> (EntityLink) inside <button> is invalid HTML (validateDOMNesting) and an ambiguous a11y
  // control. The queue row must therefore be a div with role="button", not a real <button>, so the
  // customer link can live inside it legally AND the rest of the row stays selectable.
  // Bounded to the single row element: a <button ...> with no closing tag before the EntityLink.
  // Strip comments first: a comment that merely DESCRIBES the forbidden nesting (like the one in
  // CollectionsPage explaining why the row is a div) would otherwise trip this structural check.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  if (/<button(?:(?!<\/button>)[\s\S])*?<EntityLink/.test(code)) {
    errors.push(`${PAGE}: EntityLink (an <a>) must not be nested inside a <button> — use a div with role="button"`);
  }
  if (!/role="button"/.test(src)) {
    errors.push(`${PAGE}: queue row must be a div with role="button" (keyboard-activatable) so the customer link can nest legally`);
  }

  // Detail panel Customer label present
  if (!src.includes(">Customer<") && !src.includes("Customer</div>")) {
    errors.push(`${PAGE}: detail panel must label Customer`);
  }
  return errors;
}

function selftest() {
  // The good fixture must satisfy EVERY assertion, including the selection-contract ones added
  // later (no stopPropagation wrapper, no <a> inside <button>, row carries role="button"). Without
  // role="button" here the selftest failed on its OWN fixture — a red that blocked `verify:static`
  // (local pre-push) for everyone while the plain run passed, so CI never surfaced it.
  const good = `
    import { EntityLink } from "../../components/shared/EntityLink";
    <div role="button" tabIndex={0} onClick={() => setSelectedTaskId(task.id)}>
      <EntityLink kind="customer" id={task.customer_id} />
    </div>
    <div className="text-xs">Customer</div>
    <EntityLink kind="customer" id={detailQuery.data?.task.customer_id} />
  `;
  if (check(good).length) {
    console.error(`${LABEL} SELFTEST FAILED on good: ${check(good).join("; ")}`);
    process.exit(1);
  }
  const bad = `<div>{task.customer_name ?? "Unknown customer"}</div>`;
  if (check(bad).length < 2) {
    console.error(`${LABEL} SELFTEST FAILED: planted gap must fail`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`PASS: ${LABEL} --selftest`);
  process.exit(0);
}

const errors = check(read(PAGE));
if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log(`PASS: ${LABEL}`);

#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["load.drawer.driver_pay"],"task":"DISP-F5858-LOAD-DRIVER-PAY-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
/**
 * LINK-F5171 — load.drawer.driver_pay reverse: driver bills on the load drawer must be
 * drill-through, not plain entityLabel text with no link at all.
 *
 * NOT kind="bill" — that was this guard's original ask, and it is WRONG. driver_finance.driver_bills
 * is a DIFFERENT table from accounting.bills; kind="bill" drills to /accounting/bills/:id, which
 * live-404s for a driver_finance.driver_bills row (real repro: L-20260810-0003 /
 * B-20260810-0003 -> 31f155f3-...). There is no per-id driver-bill detail route yet. The honest,
 * correct reverse link is EntityLink kind="settlement" (when the bill has settled) or kind="driver"
 * (otherwise) — never an invented AP bill link. Asserting kind="bill" here would push a future
 * author to "fix" this file back into that live 404 just to satisfy CI.
 *
 * Run: node scripts/verify-load-driver-pay-bill-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-driver-pay-bill-entitylink";
const TARGET = "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx";
const MATRIX = "docs/specs/scoreboard/modules/dispatch.required.json";
const SELF = "scripts/verify-load-driver-pay-bill-entitylink.mjs";
const HEADER = '/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["load.drawer.driver_pay"],"task":"DISP-F5858-LOAD-DRIVER-PAY-REVERSE-EXACT-LEAF","vertical":"column-wave"} */';

// Comments (including the explanatory one naming kind="bill" as forbidden) must be stripped before
// scanning for JSX usage — otherwise the comment's OWN citation of the forbidden pattern trips the
// forbidden-pattern check against itself.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function audit(src, matrix, self) {
  const failures = [];
  const code = stripComments(src);
  if (!/from ["'].*EntityLink["']/.test(code) && !/from ["']\.\.\/shared\/EntityLink["']/.test(code)) {
    failures.push(`${TARGET}: must import EntityLink`);
  }
  // A kind="bill" link on this surface is a REGRESSION (live 404 — driver_finance.driver_bills has
  // no per-id detail route), not the fix — forbid it explicitly rather than require it.
  if (/kind=["']bill["']/.test(code)) {
    failures.push(
      `${TARGET}: must NOT EntityLink kind="bill" — driver_finance.driver_bills has no /accounting/bills/:id row, this 404s live (see file's own comment)`
    );
  }
  if (!/kind=["']settlement["']/.test(code) || !/kind=["']driver["']/.test(code)) {
    failures.push(
      `${TARGET}: bill rows must reverse to EntityLink kind="settlement" (settled) or kind="driver" (otherwise)`
    );
  }
  if (
    !/data-testid=["']load-driver-pay-settlement-link["']/.test(code) ||
    !/data-testid=["']load-driver-pay-driver-link["']/.test(code)
  ) {
    failures.push(`${TARGET}: missing data-testid=load-driver-pay-settlement-link / load-driver-pay-driver-link`);
  }
  // The institutional-knowledge comment must stay — it is what stops a future "fix" from
  // reintroducing the kind="bill" 404 this guard forbids above.
  if (!/driver_finance\.driver_bills.*accounting\.bills|driver_finance\.driver_bills\s*[!≠]=?\s*accounting\.bills/.test(src)) {
    failures.push(
      `${TARGET}: must keep the comment explaining driver_finance.driver_bills != accounting.bills (why kind="bill" is forbidden here)`
    );
  }
  try {
    const leaf = JSON.parse(matrix).leaves?.find((item) => item.id === "load.drawer.driver_pay");
    if (!leaf?.required?.includes("reverse_link")) {
      failures.push(`${MATRIX}: load.drawer.driver_pay must require reverse_link`);
    }
  } catch {
    failures.push(`${MATRIX}: Required matrix must parse`);
  }
  if (!self.split("\n").includes(HEADER)) {
    failures.push(`${SELF}: Built annotation must own exactly load.drawer.driver_pay:reverse_link`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const matrix = fs.readFileSync(path.join(ROOT, MATRIX), "utf8");
  const self = fs.readFileSync(path.join(ROOT, SELF), "utf8");
  if (audit(good, matrix, self).length) {
    console.error(`${LABEL} SELFTEST FAIL — live files should pass:`, audit(good, matrix, self));
    process.exit(1);
  }
  const brokenBillLink = good.replace(/kind=["']settlement["']/, 'kind="bill"');
  if (!audit(brokenBillLink, matrix, self).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted kind="bill" regression not caught`);
    process.exit(1);
  }
  const droppedDriverLink = good.replace(/kind=["']driver["']/, 'kind="unit"');
  if (!audit(droppedDriverLink, matrix, self).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted dropped-driver-link regression not caught`);
    process.exit(1);
  }
  const droppedComment = good.replace(
    /\/\/ driver_finance\.driver_bills[\s\S]*?Never invent an AP bill link\.\n/,
    ""
  );
  if (droppedComment === good) {
    console.error(`${LABEL} SELFTEST FAIL — comment-drop mutation anchor not found, re-anchor`);
    process.exit(1);
  }
  if (!audit(droppedComment, matrix, self).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted comment-drop regression not caught`);
    process.exit(1);
  }
  const missingRequired = JSON.parse(matrix);
  const leaf = missingRequired.leaves.find((item) => item.id === "load.drawer.driver_pay");
  leaf.required = leaf.required.filter((column) => column !== "reverse_link");
  if (!audit(good, JSON.stringify(missingRequired), self).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted Required-matrix regression not caught`);
    process.exit(1);
  }
  const wrongHeader = self.replace('"leaves":["load.drawer.driver_pay"]', '"leaves":["load.drawer.factoring"]');
  if (!audit(good, matrix, wrongHeader).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted exact-header regression not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — 5/5 runtime/matrix/header defects rejected`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
const failures = audit(
  src,
  fs.readFileSync(path.join(ROOT, MATRIX), "utf8"),
  fs.readFileSync(path.join(ROOT, SELF), "utf8"),
);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — load drawer driver-pay bills reverse to settlement/driver (honest — never a live-404 bill link)`
);

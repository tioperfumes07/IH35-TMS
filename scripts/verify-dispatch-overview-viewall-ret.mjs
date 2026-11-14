#!/usr/bin/env node
/**
 * verify-dispatch-overview-viewall-ret — ROUND 8.20 board13/14.
 * Overview View-all must wrap destinations with withReturnContext; child Backs resolveBackHref.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-dispatch-overview-viewall-ret";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OVERVIEW = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";
const CHILDREN = [
  "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
  "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
  "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
  "apps/frontend/src/pages/dispatch/LoadsWithoutDriverBillPage.tsx",
  "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx",
  "apps/frontend/src/pages/dispatch/DriverBillRemintScreen.tsx",
];

export function checkOverview(src) {
  const f = [];
  if (!src) return ["DispatchOverview.tsx missing"];
  if (!/overviewHref\(/.test(src)) f.push("must define overviewHref via withReturnContext");
  for (const t of [
    "/dispatch?view=list",
    "/dispatch/at-risk",
    "/dispatch/driver-bill-remint",
    "/dispatch/detention",
    "/dispatch/border-crossing",
    "/dispatch/in-transit-issues",
  ]) {
    const re = new RegExp(`viewAllHref=\\{overviewHref\\("${t.replace(/[?]/g, "\\$&")}"\\)\\}`);
    if (!re.test(src)) f.push(`View-all must be overviewHref(${t})`);
    if (src.includes(`viewAllHref="${t}"`)) f.push(`bare viewAllHref=${t}`);
  }
  return f;
}

export function checkChild(src, file) {
  const f = [];
  if (!src) return [`${file} missing`];
  if (!/resolveBackHref/.test(src)) f.push(`${file}: must use resolveBackHref`);
  if (!/backHref=\{dispatchBackHref\}/.test(src)) f.push(`${file}: backHref must be dispatchBackHref`);
  if (/backHref="\/dispatch"/.test(src)) f.push(`${file}: still hardcodes backHref=/dispatch`);
  return f;
}

function selftest() {
  const overview = fs.readFileSync(path.join(ROOT, OVERVIEW), "utf8");
  const kids = CHILDREN.map((f) => ({ f, src: fs.readFileSync(path.join(ROOT, f), "utf8") }));
  let pass = 0;
  const total = 2 + kids.length;
  if (checkOverview(overview).length === 0) pass += 1;
  else console.error(`${LABEL} --selftest: live overview fails`, checkOverview(overview));
  const bare = overview.replace(/viewAllHref=\{overviewHref\("\/dispatch\/at-risk"\)\}/, 'viewAllHref="/dispatch/at-risk"');
  if (checkOverview(bare).length > 0) pass += 1;
  else console.error(`${LABEL} --selftest: did not catch bare at-risk`);
  for (const { f, src } of kids) {
    if (checkChild(src, f).length === 0) pass += 1;
    else console.error(`${LABEL} --selftest: live ${f} fails`, checkChild(src, f));
  }
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const overview = fs.existsSync(path.join(ROOT, OVERVIEW))
    ? fs.readFileSync(path.join(ROOT, OVERVIEW), "utf8")
    : "";
  const f = [...checkOverview(overview)];
  for (const file of CHILDREN) {
    const src = fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), "utf8") : "";
    f.push(...checkChild(src, file));
  }
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Overview View-all+ret; child Backs resolve ret`);
}

#!/usr/bin/env node
/**
 * UI-SCROLL-POSITION-NOT-RESET-ON-NAVIGATE — owner report (2026-08-25): "eveytime i click on a
 * module, it does not begin at the top of the page, it takes you to the bottom and we have to
 * scroll to the top." Live-confirmed via a scripted repro (scrolled a page to window.scrollY=4000,
 * clicked a real <Link> to a different module) that the destination page rendered at scrollY=1122,
 * not 0 -- React Router's client-side (pushState) navigation does not reset scroll on its own, and
 * grep across the whole frontend tree found zero scroll-reset-on-navigate logic anywhere before
 * this fix.
 *
 * This guard asserts:
 *  1. apps/frontend/src/components/ScrollToTop.tsx exists and only resets on non-POP navigation
 *     (must not fight the browser's own back/forward scroll memory).
 *  2. App.tsx imports and renders <ScrollToTop /> inside the router-context gate, so it actually
 *     runs on every route in the app -- not just declared and forgotten.
 */
import fs from "node:fs";

const COMPONENT_FILE = "apps/frontend/src/components/ScrollToTop.tsx";
const APP_FILE = "apps/frontend/src/App.tsx";

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function audit(componentSource, appSource) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const component = stripComments(componentSource);
  const app = stripComments(appSource);

  need(
    /export function ScrollToTop/.test(component),
    "ScrollToTop.tsx must export a ScrollToTop component"
  );
  need(
    /useLocation/.test(component) && /useNavigationType/.test(component),
    "ScrollToTop must key off both useLocation (pathname) and useNavigationType (PUSH vs POP)"
  );
  need(
    /navigationType === "POP"/.test(component) && /return;/.test(component),
    "ScrollToTop must early-return on POP navigation -- must not override the browser's own back/forward scroll restoration"
  );
  need(
    /window\.scrollTo\(0, ?0\)/.test(component),
    "ScrollToTop must call window.scrollTo(0, 0) on a genuine forward navigation"
  );

  need(
    /import\s*\{\s*ScrollToTop\s*\}\s*from\s*["']\.\/components\/ScrollToTop["']/.test(app),
    "App.tsx must import ScrollToTop from ./components/ScrollToTop"
  );
  need(
    /<ScrollToTop\s*\/>/.test(app),
    "App.tsx must actually render <ScrollToTop /> -- an unused import fixes nothing"
  );

  return failures;
}

const componentSource = fs.readFileSync(COMPONENT_FILE, "utf8");
const appSource = fs.readFileSync(APP_FILE, "utf8");

const failures = audit(componentSource, appSource);
if (failures.length) {
  console.error(`verify-scroll-to-top-wired FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "remove the POP early-return (would fight back/forward scroll memory)",
      mutate: (c, a) => [c.replace('if (navigationType === "POP") return;', ""), a],
    },
    {
      name: "stop calling scrollTo",
      mutate: (c, a) => [c.replace("window.scrollTo(0, 0);", ""), a],
    },
    {
      name: "drop the import in App.tsx",
      mutate: (c, a) => [c, a.replace('import { ScrollToTop } from "./components/ScrollToTop";\n', "")],
    },
    {
      name: "import it but never render it",
      mutate: (c, a) => [c, a.replace("<ScrollToTop />\n        ", "")],
    },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const [mc, ma] = mutate(componentSource, appSource);
    if (mc === componentSource && ma === appSource) {
      throw new Error(`mutation "${name}" did not change either source -- test is inert`);
    }
    if (audit(mc, ma).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-scroll-to-top-wired SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log("verify-scroll-to-top-wired PASS — ScrollToTop resets scroll on forward navigation, spares POP, and is actually mounted in App.tsx");

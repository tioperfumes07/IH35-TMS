#!/usr/bin/env node
/**
 * GUARD — INLINE-CREATE-NESTED-FORM.
 *
 * THE DEFECT THIS ASSERTS AGAINST (live, 2026-08-02): the Book Load wizard's inline "+ Add new
 * customer" opened, accepted input, and on Save did a native form GET — persisting NOTHING while
 * closing the wizard as if it had succeeded. The handler was not missing: NewCustomerDrawerForm
 * already called preventDefault() and createCustomer() (POST /api/v1/mdata/customers).
 *
 * The cause was structural. BookLoadModalV4 wraps its body in <form>. ParityDrawer rendered INLINE,
 * so the drawer's own <form> became a form nested inside a form — and the HTML5 parser DELETES a
 * nested <form> start tag. So:
 *   • the inner form never existed -> its onSubmit never ran -> no POST;
 *   • its <button type="submit"> re-associated with the OUTER wizard form and submitted that.
 * Standalone /customers create worked because there is no outer form there. Same defect class for
 * vendor / account / service / class — every inline create opened from inside a wizard form.
 *
 * WHAT IT ENFORCES:
 *   1. ParityDrawer renders through createPortal to document.body (un-nests the DOM).
 *   2. Every inline-create drawer form that calls preventDefault() ALSO calls stopPropagation().
 *      The portal alone is NOT sufficient: React events bubble through the REACT tree across a
 *      portal, so the parent wizard's onSubmit would still fire.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const LABEL = "verify:inline-create-not-nested-form";
const DRAWER_SHELL = "apps/frontend/src/components/parity/ParityDrawer.tsx";
const DRAWERS_DIR = "apps/frontend/src/components/parity/drawers";

function analyse(files) {
  const problems = [];

  const shell = files[DRAWER_SHELL];
  if (shell == null) {
    problems.push(`${DRAWER_SHELL} is missing — cannot verify the drawer un-nests its DOM.`);
  } else {
    if (!/createPortal\s*\(/.test(shell)) {
      problems.push(
        `${DRAWER_SHELL} does not use createPortal. Rendered inline, a drawer opened from inside a ` +
          `wizard <form> nests <form> in <form>; the HTML parser deletes the inner one, so its ` +
          `onSubmit never runs and its submit button drives the OUTER form (native GET, nothing saved).`
      );
    }
    if (!/document\.body/.test(shell)) {
      problems.push(`${DRAWER_SHELL} calls createPortal but not to document.body — the nesting may remain.`);
    }
  }

  for (const [file, src] of Object.entries(files)) {
    if (file === DRAWER_SHELL || src == null) continue;
    if (!/preventDefault\s*\(\)/.test(src)) continue; // not a submit-handling form
    if (!/stopPropagation\s*\(\)/.test(src)) {
      problems.push(
        `${file} calls preventDefault() but not stopPropagation(). React events bubble through the ` +
          `REACT tree even across the ParityDrawer portal, so the parent wizard form's onSubmit ` +
          `would still fire and close the wizard behind the inline create.`
      );
    }
  }

  return problems;
}

function readAll() {
  const out = { [DRAWER_SHELL]: existsSync(DRAWER_SHELL) ? readFileSync(DRAWER_SHELL, "utf8") : null };
  if (existsSync(DRAWERS_DIR)) {
    for (const name of readdirSync(DRAWERS_DIR)) {
      if (!name.endsWith(".tsx") || name.includes(".test.")) continue;
      const p = path.join(DRAWERS_DIR, name);
      out[p] = readFileSync(p, "utf8");
    }
  }
  return out;
}

function selftest() {
  const failures = [];
  const t = (label, cond) => {
    if (!cond) failures.push(label);
  };

  const goodShell = "createPortal(<div/>, document.body)";
  const goodForm = "e.preventDefault(); e.stopPropagation(); await createCustomer();";

  t("clean tree passes", analyse({ [DRAWER_SHELL]: goodShell, "d/NewCustomerDrawerForm.tsx": goodForm }).length === 0);

  // The REAL pre-fix shell: no portal at all.
  t(
    "pre-fix shell (no portal) FAILS",
    analyse({ [DRAWER_SHELL]: "return (<div className='fixed inset-0'/>);", "d/x.tsx": goodForm }).length >= 1
  );
  t(
    "portal to the wrong node FAILS",
    analyse({ [DRAWER_SHELL]: "createPortal(<div/>, someOtherNode)", "d/x.tsx": goodForm }).length >= 1
  );
  // The REAL pre-fix form: preventDefault without stopPropagation.
  t(
    "form missing stopPropagation FAILS",
    analyse({ [DRAWER_SHELL]: goodShell, "d/x.tsx": "e.preventDefault(); await createCustomer();" }).length === 1
  );
  t(
    "non-form drawer file (no preventDefault) is ignored",
    analyse({ [DRAWER_SHELL]: goodShell, "d/helpers.tsx": "export const X = 1;" }).length === 0
  );
  t("missing shell FAILS", analyse({ [DRAWER_SHELL]: null, "d/x.tsx": goodForm }).length >= 1);

  // Exit INSIDE selftest — verify-selftests-can-fail.mjs treats "collects failures but cannot exit
  // non-zero" as fake-green, correctly: an unreachable failure path proves nothing.
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 6 cases (2 pass-shapes, 4 fail-shapes)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — drawer portals to document.body; every inline-create form stops propagation`);

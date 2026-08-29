#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["factoring","connectivity"],"leaves":["dispatch.load.drawer.factoring_package.popup_honesty"],"task":"DSP-MONEY-F7264-FACTORING-PACKAGE-POPUP-BLOCK-STAMPS-FALSE-SUCCESS","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7264-FACTORING-PACKAGE-POPUP-BLOCK-STAMPS-FALSE-SUCCESS (CC-1, 2026-08-29):
 * LoadDetailDrawer's generateFactoringPackage ignored window.open() returning null (popup blocked),
 * then unconditionally persisted generated_at via persistPackageMeta and showed "Factoring package
 * generated." Browser popup blocking could therefore record and announce a package that was never
 * presented to the user. Root-caused live in
 * apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx. Fixed by bailing out immediately
 * (before persistPackageMeta/success toast) when window.open() returns a falsy value, surfacing an
 * honest error toast on the manual (non-auto) path instead. This guard holds that fix so it cannot
 * regress.
 *
 * Self-test: node scripts/verify-factoring-package-popup-block-honesty.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};
const LABEL = "verify-factoring-package-popup-block-honesty";

export function audit(src) {
  const failures = [];
  const fnMatch = src.drawer.match(
    /async function generateFactoringPackage\([\s\S]*?\n  \}/,
  );
  if (!fnMatch) {
    failures.push(`${FILES.drawer}: generateFactoringPackage not found`);
    return failures;
  }
  const body = fnMatch[0];

  const openIdx = body.indexOf('const win = window.open(');
  const persistIdx = body.indexOf("await persistPackageMeta(");
  const successToastIdx = body.indexOf('pushToast("Factoring package generated"');
  if (openIdx === -1 || persistIdx === -1 || successToastIdx === -1) {
    failures.push(`${FILES.drawer}: expected window.open/persistPackageMeta/success-toast call sites not found`);
    return failures;
  }

  // A guard clause bailing out on a falsy `win`, BEFORE persist/success, must exist.
  const betweenOpenAndPersist = body.slice(openIdx, persistIdx);
  if (!/if \(!win\) \{[\s\S]*?return;[\s\S]*?\}/.test(betweenOpenAndPersist)) {
    failures.push(
      `${FILES.drawer}: a popup-blocked window.open() (falsy win) must return BEFORE ` +
        `persistPackageMeta/success-toast -- otherwise a blocked popup stamps and announces a ` +
        `package that was never shown`,
    );
  }
  // The old shape wrote into `win.document` conditionally but still fell through to persist/toast
  // unconditionally -- explicitly reject that pattern even if some other guard incidentally exists.
  if (/if \(win\) \{[\s\S]*?win\.document\.write/.test(betweenOpenAndPersist) && !/if \(!win\)/.test(betweenOpenAndPersist)) {
    failures.push(
      `${FILES.drawer}: found the old "if (win) { write }" shape with no "if (!win) return" guard -- ` +
        `persist/success still runs unconditionally after a blocked popup`,
    );
  }

  return failures;
}

function loadSrc(root) {
  return {
    drawer: fs.readFileSync(path.join(root, FILES.drawer), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }

  // Mutation: revert to the old "if (win) { write }" shape with unconditional persist/toast
  // (the exact pre-fix shape).
  const reverted = {
    drawer: good.drawer.replace(
      `    if (!win) {
      if (!auto) pushToast("Factoring package popup was blocked — allow popups for this site and try again", "error");
      return;
    }
    win.document.write(html);
    win.document.close();`,
      `    if (win) {
      win.document.write(html);
      win.document.close();
    }`,
    ),
  };
  if (reverted.drawer === good.drawer) {
    console.error(`${LABEL} SELFTEST FAIL — revert pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(reverted).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — reverted popup-block-stamps-success regression escaped`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — 1 mutation detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — a blocked factoring-package popup cannot stamp generated_at or announce success`);

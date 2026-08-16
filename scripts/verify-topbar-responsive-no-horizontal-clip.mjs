#!/usr/bin/env node
/**
 * LV-TOPBAR-RESPONSIVE-HORIZONTAL-CLIP
 *
 * At ~697px the shared Topbar clipped the company switcher after "Current:" and pushed
 * Create/Tasks/Program/… past the right edge (body overflow-x:hidden). Root cause: inline
 * gridTemplateColumns on <header class="top-bar"> beat Tailwind max-xl:grid-cols-1, so the
 * three-column track never collapsed. Fix lives in CSS (.top-bar + ≤1279 stack !important)
 * plus CarrierSwitcher min-w-0 truncate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOPBAR = path.join(ROOT, "apps/frontend/src/components/Topbar.tsx");
const SWITCHER = path.join(ROOT, "apps/frontend/src/components/layout/CarrierSwitcher.tsx");
const CSS = path.join(ROOT, "apps/frontend/src/styles/responsive-breakpoints.css");
const SHELL = path.join(ROOT, "apps/frontend/src/components/Shell.tsx");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

export function collectFailures({ topbar, switcher, css, shell }) {
  const failures = [];

  if (/gridTemplateColumns\s*:/.test(topbar)) {
    failures.push(
      "Topbar.tsx must not set inline gridTemplateColumns (beats responsive stack; LV-TOPBAR-RESPONSIVE-HORIZONTAL-CLIP)"
    );
  }
  if (!/className="[^"]*top-bar/.test(topbar) && !/className=\{`[^`]*top-bar/.test(topbar)) {
    // tolerate template or string
    if (!/\btop-bar\b/.test(topbar)) {
      failures.push("Topbar.tsx header must keep class top-bar for CSS stack");
    }
  }
  if (!/top-bar-date-label/.test(topbar)) {
    failures.push("Topbar.tsx must mark the datetime with top-bar-date-label (hidden ≤767px)");
  }

  if (!/\.top-bar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*auto\)\s+minmax\(0,\s*1fr\)/s.test(css)) {
    failures.push("responsive-breakpoints.css must define desktop .top-bar as minmax(0,1fr) minmax(0,auto) minmax(0,1fr)");
  }
  if (!/@media\s*\(\s*max-width:\s*1279px\s*\)\s*\{[\s\S]*?\.top-bar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/s.test(css)) {
    failures.push("responsive-breakpoints.css must stack .top-bar to one minmax(0,1fr) column at max-width 1279px with !important");
  }
  if (!/@media\s*\(\s*max-width:\s*767px\s*\)[\s\S]*\.top-bar-date-label/s.test(css)) {
    failures.push("responsive-breakpoints.css must hide .top-bar-date-label at max-width 767px");
  }

  if (!/min-w-0/.test(switcher) || !/truncate/.test(switcher)) {
    failures.push("CarrierSwitcher trigger must use min-w-0 + truncate so the company name shrinks instead of clipping after Current:");
  }
  if (!/max-w-\[min\(280px,100%\)\]/.test(switcher)) {
    failures.push("CarrierSwitcher trigger must cap width with max-w-[min(280px,100%)]");
  }

  if (!/responsive-breakpoints\.css/.test(shell)) {
    failures.push("Shell.tsx must import responsive-breakpoints.css so the top-bar stack is loaded");
  }

  return failures;
}

function selftest() {
  const clean = {
    topbar: read(TOPBAR),
    switcher: read(SWITCHER),
    css: read(CSS),
    shell: read(SHELL),
  };
  const cleanFails = collectFailures(clean);
  if (cleanFails.length) {
    console.error("verify-topbar-responsive-no-horizontal-clip --selftest FAILED — clean tree:\n" + cleanFails.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }

  const planted = [
    {
      name: "inline gridTemplateColumns",
      mut: (f) => ({
        ...f,
        topbar: f.topbar.replace(
          "minHeight: spacing.topbarHeight,",
          'gridTemplateColumns: "minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr)",\n          minHeight: spacing.topbarHeight,'
        ),
      }),
    },
    {
      name: "no 1279 stack",
      mut: (f) => ({
        ...f,
        css: f.css.replace(/max-width:\s*1279px/g, "max-width: 1px"),
      }),
    },
    {
      name: "switcher loses min-w-0",
      mut: (f) => ({
        ...f,
        switcher: f.switcher.replace(/min-w-0/g, "min-w-fit"),
      }),
    },
  ];

  for (const p of planted) {
    const fails = collectFailures(p.mut(clean));
    if (!fails.length) {
      console.error(`verify-topbar-responsive-no-horizontal-clip --selftest FAILED — planted ${p.name} escaped`);
      process.exit(1);
    }
  }

  console.log("verify-topbar-responsive-no-horizontal-clip --selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = collectFailures({
    topbar: read(TOPBAR),
    switcher: read(SWITCHER),
    css: read(CSS),
    shell: read(SHELL),
  });
  if (failures.length) {
    console.error("verify-topbar-responsive-no-horizontal-clip FAILED —");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-topbar-responsive-no-horizontal-clip OK");
}

main();

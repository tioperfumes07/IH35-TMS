#!/usr/bin/env node
/**
 * LV-HOVERDROPDOWN-HOVER-CLICK-SELF-CLOSE
 * Hover opens → first pointer click must not close; second intentional click may close.
 * Consumers: CategoryHoverNav, ReportCategoryHoverNav, SafetyGroupNav.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/frontend/src/components/shared/HoverDropdown.tsx");
const CONSUMERS = [
  "apps/frontend/src/components/reports/CategoryHoverNav.tsx",
  "apps/frontend/src/components/reports/ReportCategoryHoverNav.tsx",
  "apps/frontend/src/components/safety/SafetyGroupNav.tsx",
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkSource(src, label = "HoverDropdown.tsx") {
  assert(src.includes("openedViaHoverRef"), `${label}: missing openedViaHoverRef`);
  assert(
    /onMouseEnter=\{\(\)\s*=>\s*openNow\(true\)\}/.test(src) || /openNow\(true\)/.test(src),
    `${label}: onMouseEnter must call openNow(true)`,
  );
  assert(
    /if\s*\(open\s*&&\s*openedViaHoverRef\.current\)/.test(src),
    `${label}: first click after hover must gate on openedViaHoverRef.current`,
  );
  assert(
    !/onClick=\{\(\)\s*=>\s*\{\s*if\s*\(open\)\s*\{\s*closeNow\(\);\s*return;\s*\}/.test(src),
    `${label}: forbidden self-close-when-open onClick pattern`,
  );
  for (const rel of CONSUMERS) {
    const full = path.join(ROOT, rel);
    assert(fs.existsSync(full), `missing consumer ${rel}`);
    assert(fs.readFileSync(full, "utf8").includes("HoverDropdown"), `${rel} must use HoverDropdown`);
  }
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  checkSource(good, "real");

  const mutations = [
    ["no-flag", good.replaceAll("openedViaHoverRef", "openedViaX")],
    [
      "old-toggle",
      good.replace(
        /onClick=\{\(\) => \{[\s\S]*?\n        \}\}/,
        `onClick={() => {
          if (open) {
            closeNow();
            return;
          }
          openNow(false);
        }}`,
      ),
    ],
    ["no-hover-true", good.replace("openNow(true)", "openNow(false)")],
  ];

  for (const [name, src] of mutations) {
    let failed = false;
    try {
      checkSource(src, name);
    } catch {
      failed = true;
    }
    assert(failed, `selftest ${name}: expected checkSource to throw`);
  }
  console.log("verify-hoverdropdown-click-after-hover --selftest PASS (3/3 mutations)");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-hoverdropdown-click-after-hover FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkSource(fs.readFileSync(TARGET, "utf8"));
    console.log(
      "verify-hoverdropdown-click-after-hover PASS — click-after-hover stay-open + 3 consumers",
    );
  } catch (e) {
    console.error(`verify-hoverdropdown-click-after-hover FAIL — ${e.message}`);
    process.exit(1);
  }
}

#!/usr/bin/env node
/**
 * The in-app Module Completion scoreboard must show the same numbers CI does.
 *
 * apps/frontend/src/generated/module-completion.ts is generated from docs/module-completion/*.json.
 * If a manifest changes and the generated file is not regenerated, the product would display stale
 * counts — a screen confidently reporting progress that no longer matches the source of truth. That
 * is worse than showing nothing, because it is believed.
 *
 * Also asserts the FIRST_14 list matches the first 14 entries of SIDEBAR_ITEM_IDS, so "the first 14
 * modules" in the UI always means the first 14 in the actual nav, not a list that drifted.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SIDEBAR = join(process.cwd(), "apps", "frontend", "src", "components", "layout", "sidebar-config.ts");
const GENERATED = join(process.cwd(), "apps", "frontend", "src", "generated", "module-completion.ts");

function sidebarFirst14() {
  const src = readFileSync(SIDEBAR, "utf8");
  const start = src.indexOf("export const SIDEBAR_ITEM_IDS");
  if (start === -1) throw new Error("SIDEBAR_ITEM_IDS not found in sidebar-config.ts");
  const open = src.indexOf("[", start);
  const close = src.indexOf("]", open);
  const ids = [...src.slice(open, close).matchAll(/"([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]);
  return ids.slice(0, 14);
}

function generatedFirst14() {
  const src = readFileSync(GENERATED, "utf8");
  const start = src.indexOf("FIRST_14_MODULE_IDS");
  if (start === -1) throw new Error("FIRST_14_MODULE_IDS not found in the generated module");
  // Anchor on the assignment, not the first "[" — the declaration is `FIRST_14_MODULE_IDS: string[] = [`
  // and the type annotation's brackets come first, which yielded an empty list.
  const eq = src.indexOf("= [", start);
  if (eq === -1) throw new Error("FIRST_14_MODULE_IDS array literal not found");
  const open = eq + 2;
  const close = src.indexOf("]", open);
  return [...src.slice(open, close).matchAll(/"([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]);
}

function main() {
  const failures = [];

  // 1) Generated data must be byte-identical to a fresh generation.
  try {
    execFileSync(process.execPath, ["scripts/generate-module-completion-data.mjs", "--check"], {
      stdio: "pipe",
    });
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    failures.push(out || "generated module-completion data is stale — run the generator");
  }

  // 2) The UI's "first 14" must be the real first 14 of the sidebar.
  let sidebar14 = [];
  let gen14 = [];
  try {
    sidebar14 = sidebarFirst14();
    gen14 = generatedFirst14();
  } catch (e) {
    failures.push(String(e.message ?? e));
  }
  if (sidebar14.length === 14 && gen14.length === 14) {
    const mismatch = sidebar14.filter((id, i) => gen14[i] !== id);
    if (mismatch.length > 0) {
      failures.push(
        `FIRST_14_MODULE_IDS does not match the first 14 SIDEBAR_ITEM_IDS.\n` +
          `  sidebar: ${sidebar14.join(", ")}\n` +
          `  ui:      ${gen14.join(", ")}`
      );
    }
  } else if (failures.length === 0) {
    failures.push(`expected 14 ids on both sides; got sidebar=${sidebar14.length} ui=${gen14.length}`);
  }

  if (failures.length > 0) {
    console.error("verify-module-completion-ui-in-sync FAIL:");
    for (const f of failures) console.error(`\n  ${f}`);
    process.exit(1);
  }
  console.log(
    `verify-module-completion-ui-in-sync OK — generated data matches the manifests; ` +
      `FIRST_14 matches sidebar order (${sidebar14.join(", ")})`
  );
}

main();

#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow"],"cols":["qbo_chrome"],"leafRe":"^cash-flow\\.panel\\.projection$","task":"CASHFLOW-ADJUSTMENT-ADD-CHROME-LAW-8","vertical":"column-wave"}
 *
 * Fully-Wired item 8 (chrome law): "Primary buttons: + Create / + Book only (never + New / + Add)".
 * DailyPredictionTab.tsx's cash-flow-adjustment button rendered a Plus icon plus the text "Add" —
 * visually the forbidden "+ Add" pattern — relabeled to "Create", matching the
 * "+ Create Line"-class convention used elsewhere for adding a line/entry.
 */
import fs from "node:fs";
const LABEL = "verify-cash-flow-adjustment-add-chrome-law";
const FILE = "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx";

function audit(src) {
  const failures = [];
  const m = src.match(/data-testid="cash-flow-adjustment-add"[\s\S]{0,300}/);
  if (!m) {
    failures.push("cash-flow-adjustment-add button not found");
    return failures;
  }
  const block = m[0];
  if (!/<Plus className="h-3 w-3" \/>\s*Create\s*<\/button>/.test(block)) failures.push("adjustment button must read 'Create' next to the Plus icon");
  if (/<Plus className="h-3 w-3" \/>\s*Add\s*<\/button>/.test(block)) failures.push("adjustment button must not use the forbidden 'Add' verb (chrome law item 8)");
  leftoverRefuse(src, failures);
  return failures;
}

function leftoverRefuse(src, failures) {
  if (src.includes("text-[11px]")) failures.push("leftover text-[11px]");
  if (src.includes("#8A92AB") || src.includes("#334155")) failures.push("leftover off-scale muted");
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(FILE, "utf8");
  const mutations = [
    ["revert-to-add", (s) => s.replace(
      '<Plus className="h-3 w-3" />\n                    Create\n                  </button>',
      '<Plus className="h-3 w-3" />\n                    Add\n                  </button>',
    )],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = mutate(src);
    if (candidate === src || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  const leftoverPlant = `${src}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`;
  const leftoverFailures = audit(leftoverPlant);
  if (!leftoverFailures.includes("leftover text-[11px]") || !leftoverFailures.includes("leftover off-scale muted")) {
    console.error(`${LABEL} SELFTEST FAIL — leftover plant escaped — ${leftoverFailures.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected + leftover plant rejected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(FILE, "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — cash-flow adjustment button reads "Create" next to the Plus icon, no forbidden "Add" verb`);

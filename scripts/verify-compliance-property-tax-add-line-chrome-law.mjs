#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["qbo_chrome"],"leafRe":"^property_tax\\.rendition$","task":"COMPLIANCE-PROPERTY-TAX-ADD-LINE-CHROME-LAW-8","vertical":"column-wave"}
 *
 * Fully-Wired item 8 (chrome law): "Primary buttons: + Create / + Book only (never + New / + Add)".
 * PropertyTaxRenditionPage.tsx's asset-line button used the forbidden "+ Add" verb; relabeled to
 * "+ Create Line" to match InvoiceDetailPage.tsx's identical add-a-row-to-a-list pattern.
 */
import fs from "node:fs";
const LABEL = "verify-compliance-property-tax-add-line-chrome-law";
const FILE = "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx";

function audit(src) {
  const failures = [];
  if (!/>\s*\+\s*Create Line\s*</.test(src)) failures.push("asset-line button must read '+ Create Line' (chrome law item 8)");
  if (/>\s*\+\s*Add\s*</.test(src)) failures.push("asset-line button must not use the forbidden '+ Add' verb (chrome law item 8: never + New / + Add)");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(FILE, "utf8");
  const mutations = [
    ["revert-to-add", (s) => s.replace(">\n            + Create Line\n          </button>", ">\n            + Add\n          </button>")],
    // RE-ANCHOR (found stale 2026-08-29): a bare `.replace("+ Create Line", "Create Line")` hits the
    // FIRST occurrence of that substring in the WHOLE FILE — which is inside a comment above (line
    // ~341, "a failed \"+ Create Line\""), not the real button JSX at line ~509. The comment got
    // mutated instead, the real button stayed untouched, and the guard correctly (but uselessly)
    // still passed. Anchor on the same JSX-shaped context the sibling "revert-to-add" case uses.
    ["drop-plus", (s) => s.replace(">\n            + Create Line\n          </button>", ">\n            Create Line\n          </button>")],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = mutate(src);
    if (candidate === src || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(FILE, "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — property tax rendition's asset-line button reads "+ Create Line", no forbidden "+ Add" verb`);

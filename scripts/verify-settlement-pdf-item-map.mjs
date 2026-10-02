#!/usr/bin/env node
// ROUND 326 queue item 8 (G-09, CC-1) — ONE item catalog map. Signed-PDF expense categories resolve to catalogs.items
// BY ID through apps/backend/src/catalogs/settlement-pdf-item-map.ts (Lead map, docs/bus/00-CANONICAL-ITEM-AND-ACCOUNT-MAP.md).
// This guard fails if:
//   1. any map id differs from the Lead's canonical map document (the doc is the ruling; the code follows it);
//   2. the resolver reads catalogs.items by name instead of by id;
//   3. the document seed resolves expense items any other way (keyword aliases back, or no map call).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-settlement-pdf-item-map";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  map: "apps/backend/src/catalogs/settlement-pdf-item-map.ts",
  doc: "docs/bus/00-CANONICAL-ITEM-AND-ACCOUNT-MAP.md",
  seed: "apps/backend/src/feed/seed-settlement-document.service.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  const docRows = [...src.doc.matchAll(/^\|\s*([^|]+?)\s*\|\s*`([0-9a-f-]{36})`\s*\|/gm)].map((m) => [m[1].trim(), m[2]]);
  if (docRows.length < 10) p.push("could not read the Lead's PDF category -> item id table");
  const code = [...src.map.matchAll(/pdfCategory: "([^"]+)", itemId: "([0-9a-f-]{36})"/g)].map((m) => [m[1], m[2]]);
  const codeBy = new Map(code);
  for (const [cat, id] of docRows) {
    const key = cat.startsWith("GAS") ? "GAS" : cat.startsWith("COMIDAS") ? "COMIDAS" : cat;
    if (codeBy.get(key) !== id) p.push(`map entry "${key}" must be ${id} (Lead map), found ${codeBy.get(key) ?? "none"}`);
  }
  if (code.length !== docRows.length) p.push(`map has ${code.length} entries; the Lead map has ${docRows.length}`);
  const map = strip(src.map);
  if (!/FROM catalogs\.items\s+WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/.test(map)) p.push("the resolver must read catalogs.items BY ID, entity-scoped");
  if (/item_name\s*=\s*\$/.test(map)) p.push("the resolver looks an item up by name");
  const seed = strip(src.seed);
  if (!/resolveSettlementPdfItem\(/.test(seed)) p.push("the document seed must resolve expense items through resolveSettlementPdfItem");
  if (/EXPENSE_ITEM_ALIASES|\\btoll\\b/.test(seed)) p.push("keyword item aliases are back in the document seed");
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["mexico toll to usa id", { ...src, map: src.map.replace('itemId: "ea839892-2631-417e-b21d-ca361c238e89"', 'itemId: "00000000-0000-4000-8000-000000000000"') }],
      ["name lookup", { ...src, map: src.map.replace("WHERE id = $1::uuid AND operating_company_id", "WHERE item_name = $1 AND operating_company_id") }],
      ["aliases back", { ...src, seed: src.seed + "\nconst EXPENSE_ITEM_ALIASES = [];" }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — every signed-PDF category resolves by id through the one Lead-ruled map.`);
}

#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["picker_law"],"leafRe":"^catalog\\..*$","task":"LST-F-FOREIGN-KEY-RAW-INPUT-CHROME-LAW-9"}
 *
 * Fully-Wired item 9 (picker law): `CatalogFieldConfig`'s "foreign_key" field type rendered as a
 * bare <input type="text"> demanding the operator hand-type the raw FK UUID, even though
 * `field.foreignKey` already carries {catalogName, labelField, valueField} — everything needed to
 * render a real searchable picker, matching every other field type (enum already uses a real
 * dropdown). No catalog in GENERIC_CATALOG_REGISTRY currently declares a foreign_key field (static-
 * discovered, not yet live-reachable) — fixed anyway so picker_law holds the moment any catalog
 * does. Fixed by rendering a real Combobox sourced from useCatalogQuery(foreignKey.catalogName).
 */
import fs from "node:fs";
const LABEL = "verify-catalog-foreign-key-field-uses-picker";
const FILE = "apps/frontend/src/components/catalogs/CatalogEditModal.tsx";

function audit(src) {
  const failures = [];
  const fkBlock = src.match(/if \(field\.type === "foreign_key"\) \{[\s\S]*?\n {2}\}\n\n {2}if \(field\.type === "date"\)/)?.[0] ?? "";
  if (!fkBlock) {
    failures.push('could not find the field.type === "foreign_key" render branch');
    return failures;
  }
  if (/<input\s+type="text"[\s\S]{0,80}Foreign key ID/.test(fkBlock)) {
    failures.push("foreign_key field must not render a raw <input type=\"text\"> demanding a hand-typed FK id");
  }
  if (!/<Combobox/.test(fkBlock)) {
    failures.push("foreign_key field must render a real <Combobox> picker");
  }
  if (!/useCatalogQuery\(/.test(src)) {
    failures.push("must source picker options from useCatalogQuery(field.foreignKey.catalogName, ...)");
  }
  if (!/companyId/.test(src)) {
    failures.push("CatalogEditModal must accept and thread companyId (needed to scope the referenced-catalog query)");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(FILE, "utf8");
  const mutations = [
    [
      "revert-to-raw-input",
      (s) =>
        s.replace(
          /if \(field\.type === "foreign_key"\) \{[\s\S]*?\n {2}\}\n\n {2}if \(field\.type === "date"\)/,
          `if (field.type === "foreign_key") {\n    return (\n      <input\n        type="text"\n        value={String(value ?? "")}\n        disabled={disabled}\n        placeholder={field.placeholder ?? "Foreign key ID"}\n        className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"\n        onChange={(event) => onChange(event.target.value)}\n      />\n    );\n  }\n\n  if (field.type === "date")`
        ),
    ],
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
console.log(`${LABEL} PASS — CatalogEditModal's foreign_key field renders a real Combobox picker, not a raw text/UUID input`);

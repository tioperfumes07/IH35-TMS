#!/usr/bin/env node
/**
 * verify-catalog-label-column-not-self-aliased.mjs
 *
 * ROOT CAUSE (live-pinned 2026-08-22, CC3-CATLABEL-01): generic-catalog.factory.ts's
 * apiColumnForDbColumn() unconditionally renames any physical column matching
 * `config.displayNameColumn` to the API key `display_name` on every SELECT. That mechanism exists
 * for catalogs whose frontend field key IS the generic "display_name" (mapped to a differently
 * named physical column, e.g. driverTerminationReasonsCatalogConfig: physical `label`, API
 * `display_name`) -- correct use.
 *
 * `dispatchErrorReasonsCatalogConfig` and `customerQualityEventReasonsCatalogConfig` instead use
 * `label` as their OWN literal API field key (present in both allowedColumns and validators,
 * consumed by the frontend via `key: "label"`, per useCatalogQuery.ts). Both ALSO set
 * `displayNameColumn: "label"` -- a copy-paste leftover that made the SELECT alias `label` to
 * `display_name`, a key the frontend never reads for these catalogs. Every created row's Label
 * silently vanished from the list + Edit form (blank/dash), even though the data was correctly
 * written to the physical `label` column -- confirmed live via a real create, a
 * window.fetch-captured POST body proving the frontend sent `label` correctly, and a raw GET
 * showing the API returned it as `display_name` instead.
 *
 * INVARIANT (static -- no database): a GenericCatalogConfig block whose `allowedColumns` contains
 * a column X as its own literal entry (X !== "display_name") must not also set
 * `displayNameColumn: "X"` -- that combination self-aliases X away from its own API key with no
 * `display_name` key ever exposed to receive it. `displayNameColumn` may still alias a column NOT
 * separately present in allowedColumns (the correct shape).
 *
 * Self-test: node scripts/verify-catalog-label-column-not-self-aliased.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-catalog-label-column-not-self-aliased";
const TARGET_FILES = [
  "apps/backend/src/catalogs/generic-catalog.routes.ts",
  "apps/backend/src/catalogs/generic-catalog.factory.ts",
];

/** Splits a source file into `export const XConfig: GenericCatalogConfig = { ... };` blocks. */
export function extractCatalogConfigBlocks(text) {
  const masked = maskComments(text);
  const blocks = [];
  const startRe = /export const \w+CatalogConfig\s*:\s*GenericCatalogConfig\s*=\s*\{/g;
  let match;
  while ((match = startRe.exec(masked))) {
    const openBraceIdx = match.index + match[0].length - 1;
    let depth = 1;
    let i = openBraceIdx + 1;
    while (i < masked.length && depth > 0) {
      if (masked[i] === "{") depth += 1;
      else if (masked[i] === "}") depth -= 1;
      i += 1;
    }
    blocks.push({ name: match[0], text: text.slice(match.index, i) });
  }
  return blocks;
}

/** Returns a list of self-alias violations found in one catalog config block's source text. */
export function findSelfAliasViolations(blockText) {
  const masked = maskComments(blockText);
  const displayNameColMatch = masked.match(/displayNameColumn\s*:\s*"([^"]+)"/);
  if (!displayNameColMatch) return [];
  const displayNameColumn = displayNameColMatch[1];
  if (displayNameColumn === "display_name") return [];

  const allowedColsMatch = masked.match(/allowedColumns\s*:\s*\[([^\]]*)\]/);
  if (!allowedColsMatch) return [];
  const allowedColumns = allowedColsMatch[1]
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

  if (!allowedColumns.includes(displayNameColumn)) return [];
  if (allowedColumns.includes("display_name")) return [];

  return [
    `displayNameColumn: "${displayNameColumn}" self-aliases a column that is ALSO its own literal ` +
      `entry in allowedColumns (no "display_name" key present to receive the rename) -- the API ` +
      `will silently drop "${displayNameColumn}" from every read.`,
  ];
}

function staticCheck() {
  const failures = [];
  for (const rel of TARGET_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, "utf8");
    for (const block of extractCatalogConfigBlocks(src)) {
      const violations = findSelfAliasViolations(block.text);
      for (const v of violations) {
        failures.push(`${rel} ${block.name} -- ${v}`);
      }
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const bad = `
    export const fooCatalogConfig: GenericCatalogConfig = {
      catalogName: "x.foo",
      displayNameColumn: "label",
      allowedColumns: ["code", "label", "description"],
      validators: { label: z.string() },
    };
  `;
  const badBlocks = extractCatalogConfigBlocks(bad);
  if (badBlocks.length !== 1 || findSelfAliasViolations(badBlocks[0].text).length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL -- self-aliased label config was not caught`);
    process.exit(1);
  }

  const goodAliased = `
    export const barCatalogConfig: GenericCatalogConfig = {
      catalogName: "x.bar",
      displayNameColumn: "label",
      allowedColumns: ["code", "display_name", "description"],
      validators: { display_name: z.string() },
    };
  `;
  const goodBlocks1 = extractCatalogConfigBlocks(goodAliased);
  if (goodBlocks1.length !== 1 || findSelfAliasViolations(goodBlocks1[0].text).length !== 0) {
    console.error(
      `${LABEL} SELFTEST FAIL -- legitimate physical-column-to-display_name alias was wrongly flagged`
    );
    process.exit(1);
  }

  const goodNoAlias = `
    export const bazCatalogConfig: GenericCatalogConfig = {
      catalogName: "x.baz",
      displayNameColumn: "display_name",
      allowedColumns: ["code", "display_name", "description"],
      validators: { display_name: z.string() },
    };
  `;
  const goodBlocks2 = extractCatalogConfigBlocks(goodNoAlias);
  if (goodBlocks2.length !== 1 || findSelfAliasViolations(goodBlocks2[0].text).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL -- displayNameColumn === "display_name" was wrongly flagged`);
    process.exit(1);
  }

  const commentedOut = `
    export const quuxCatalogConfig: GenericCatalogConfig = {
      catalogName: "x.quux",
      // displayNameColumn: "label",
      allowedColumns: ["code", "label", "description"],
      validators: { label: z.string() },
    };
  `;
  const commentBlocks = extractCatalogConfigBlocks(commentedOut);
  if (commentBlocks.length !== 1 || findSelfAliasViolations(commentBlocks[0].text).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL -- a commented-out displayNameColumn was wrongly flagged`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const failures = staticCheck();
if (failures.length > 0) {
  console.error(`${LABEL} FAILED -- ${failures.length} self-aliased catalog config(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK -- 0 self-aliased catalog label columns`);

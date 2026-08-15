#!/usr/bin/env node
/**
 * verify-inline-create-writes-canonical.mjs  (Doc-18 GAP A — inline-create split-brain regression guard)
 *
 * The banking "+ Add new" inline-create (payee/vendor, customer, product/service item) MUST write the
 * CANONICAL master table that the backing dropdown re-reads after reload, never a `mdata.qbo_*` mirror:
 *
 *   vendor   → createVendor            → POST /api/v1/mdata/vendors            → INSERT INTO mdata.vendors
 *   customer → createCustomer          → POST /api/v1/mdata/customers          → INSERT INTO mdata.customers
 *   item     → itemsCatalogClient.create → POST /api/v1/catalogs/accounting/items → INSERT INTO catalogs.items
 *
 * If any of these create paths targets a `qbo_*` mirror (createQboVendor/createQboCustomer/createQboItem, or a
 * `mdata.qbo_vendors|qbo_customers|qbo_items` write) as the PRIMARY create, the created entity vanishes after
 * refetch (the split-brain "nothing gets created" bug). This guard FAILS on that, and FAILS if the canonical
 * create anchor is missing — so the fix "stays fixed" (LINKAGE LAW §10(b): never write/FK a RETIRE mirror).
 *
 * Usage:
 *   node scripts/verify-inline-create-writes-canonical.mjs            # scan
 *   node scripts/verify-inline-create-writes-canonical.mjs --selftest # inject a regression -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const NEW_SERVICE = "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx";
const ITEM_EDITOR = "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx";

function newServiceEmbedsItemEditor(src) {
  return (
    /<ItemEditorModal[\s>]/.test(src) &&
    (/from ["'].*ItemEditorModal["']|from ["'].*\/ItemEditorModal["']/.test(src) ||
      /import\s*\{\s*ItemEditorModal\s*\}/.test(src))
  );
}

// Files whose inline-create submit paths must remain canonical, with the canonical anchor each must keep.
const CANONICAL_SURFACES = [
  {
    file: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
    anchors: [/\bcreateVendor\s*\(/, /\bcreateCustomer\s*\(/, /itemsCatalogClient\.create\s*\(/],
  },
  {
    file: NEW_SERVICE,
    anchors: [/itemsCatalogClient\.create\s*\(/, /itemsCatalogClient/, /<ItemEditorModal[\s>]/],
    embedEditor: ITEM_EDITOR,
    embedAnchor: /\bclient\.create\s*\(/,
  },
];

// A qbo_* mirror write used as the create target for vendor/customer/item — the split-brain regression.
const FORBIDDEN_MIRROR_CREATE = /\bcreateQbo(?:Vendor|Customer|Item)\s*\(|mdata\.qbo_(?:vendors|customers|items)\b|createQboAccount\s*\([^)]*account_type:\s*["'`](?:Vendor|Customer|Item)["'`]/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Injectable core assertion: `sources` optionally overrides a surface file's raw text (or `null` to
 * simulate the file being missing). Any surface not present as a key is read live from disk — so a
 * no-arg call behaves exactly like the old `scan()`, while --selftest can drive it with mutated real
 * file content.
 */
export function assertInlineCreateCanonical(sources = {}) {
  const failures = [];
  for (const surface of CANONICAL_SURFACES) {
    const overridden = Object.prototype.hasOwnProperty.call(sources, surface.file);
    const raw = overridden
      ? sources[surface.file]
      : fs.existsSync(path.join(repoRoot, surface.file))
        ? fs.readFileSync(path.join(repoRoot, surface.file), "utf8")
        : null;
    if (raw == null) {
      failures.push(`${surface.file} — MISSING (was a canonical inline-create surface)`);
      continue;
    }
    const src = stripComments(raw);
    if (surface.file === NEW_SERVICE) {
      let anchorMatched = false;
      for (const anchor of surface.anchors) {
        if (anchor.test(src)) {
          anchorMatched = true;
          break;
        }
      }
      if (!anchorMatched && surface.embedEditor && newServiceEmbedsItemEditor(src)) {
        const editorRaw = Object.prototype.hasOwnProperty.call(sources, surface.embedEditor)
          ? sources[surface.embedEditor]
          : fs.existsSync(path.join(repoRoot, surface.embedEditor))
            ? fs.readFileSync(path.join(repoRoot, surface.embedEditor), "utf8")
            : null;
        if (editorRaw == null) {
          failures.push(`${surface.embedEditor} — MISSING (NewServiceDrawerForm embeds ItemEditorModal for canonical create)`);
        } else if (!surface.embedAnchor.test(stripComments(editorRaw))) {
          failures.push(
            `${surface.file} — embeds ItemEditorModal but ${surface.embedEditor} lost canonical create anchor ${surface.embedAnchor}`,
          );
        } else {
          anchorMatched = true;
        }
      }
      if (!anchorMatched) {
        failures.push(
          `${surface.file} — lost canonical create anchor (create must write the canonical master table, not a qbo_* mirror)`,
        );
      }
    } else {
      for (const anchor of surface.anchors) {
        if (!anchor.test(src)) {
          failures.push(`${surface.file} — lost canonical create anchor ${anchor} (create must write the canonical master table, not a qbo_* mirror)`);
        }
      }
    }
    if (FORBIDDEN_MIRROR_CREATE.test(src)) {
      failures.push(`${surface.file} — writes a qbo_* MIRROR as the vendor/customer/item create target (split-brain: entity vanishes after refetch)`);
    }
  }
  return failures;
}

export function run() {
  const failures = assertInlineCreateCanonical();
  if (failures.length) {
    console.error("[verify-inline-create-writes-canonical] FAIL:");
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  console.log(`[verify-inline-create-writes-canonical] PASS — ${CANONICAL_SURFACES.length} inline-create surfaces write canonical mdata.vendors / mdata.customers / catalogs.items`);
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const problems = [];

  // Snapshot the REAL surface files as they exist on disk right now.
  const realSources = {};
  for (const surface of CANONICAL_SURFACES) {
    const full = path.join(repoRoot, surface.file);
    realSources[surface.file] = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  }

  const goodFailures = assertInlineCreateCanonical(realSources);
  if (goodFailures.length) {
    problems.push(`unmutated real sources should pass, got: ${goodFailures.join(" | ")}`);
  }

  const target = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";
  const realSrc = realSources[target];
  if (realSrc == null) {
    problems.push(`${target} missing on disk — cannot plant a mutation against it`);
  } else {
    const plant = (label, mutated, expectFragment) => {
      if (mutated === realSrc) {
        problems.push(`planted regression "${label}" did not mutate the source — selftest is inert`);
        return;
      }
      const failures = assertInlineCreateCanonical({ ...realSources, [target]: mutated });
      if (!failures.some((f) => f.includes(expectFragment))) {
        problems.push(`planted regression "${label}" was NOT caught — assertion is ineffective`);
      }
    };

    // The regression this guard exists for: the vendor create swapped for the qbo_* mirror.
    plant(
      "vendor-create-swapped-for-mirror",
      realSrc.replace(/\bcreateVendor\s*\(/, "createQboVendor("),
      "writes a qbo_* MIRROR"
    );
    // The customer canonical anchor disappears (e.g. renamed/refactored away) with nothing replacing it.
    plant(
      "customer-anchor-removed",
      realSrc.replace(/\bcreateCustomer\s*\(/g, "legacyCreateHandler("),
      "lost canonical create anchor"
    );
    // A direct mirror-table INSERT is added alongside the canonical calls (not a comment — stripComments()
    // removes `//` lines, so a commented-out probe here would silently never reach the detector).
    plant(
      "direct-mirror-table-insert-added",
      `${realSrc}\nexport const __regressionProbe = \`INSERT INTO mdata.qbo_customers (id) VALUES ($1)\`;\n`,
      "writes a qbo_* MIRROR"
    );
  }

  // A canonical surface file disappearing entirely (moved/deleted) must also be caught.
  const missingFailures = assertInlineCreateCanonical({ ...realSources, [target]: null });
  if (!missingFailures.some((f) => f.includes("MISSING"))) {
    problems.push('planted regression "surface-file-missing" was NOT caught — assertion is ineffective');
  }

  if (problems.length) {
    console.error("[verify-inline-create-writes-canonical] SELFTEST FAILED:");
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }
  console.log(
    "[verify-inline-create-writes-canonical] SELFTEST PASS — real sources clean; 4 planted regressions all caught"
  );
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}

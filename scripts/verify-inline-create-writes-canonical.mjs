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
 * PICKER-QUICK-CREATE-ENTITY-KIND-TYPE-DRIFT / LST-F3368: QuickCreateEntityModal's vendor/item kinds now
 * early-return to the embedded canonical Lists creators (VendorCreateModal / ItemEditorModal) instead of
 * calling createVendor()/itemsCatalogClient.create() inline — so those two anchors are embed-aware (checked
 * on the surface file directly first, falling back to the embedded creator when the surface genuinely
 * delegates that kind), same shape as NEW_SERVICE's existing embedEditor fallback below.
 *
 * Usage:
 *   node scripts/verify-inline-create-writes-canonical.mjs            # scan
 *   node scripts/verify-inline-create-writes-canonical.mjs --selftest # inject a regression -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const QUICK_CREATE = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";
const NEW_SERVICE = "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx";
const ITEM_EDITOR = "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx";
const VENDOR_CREATE_MODAL = "apps/frontend/src/components/vendors/VendorCreateModal.tsx";
const NEW_CUSTOMER_FORM = "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx";
const ACCOUNT_DRAWER = "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx";
const NEW_ACCOUNT_FORM = "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx";

function newServiceEmbedsItemEditor(src) {
  return (
    /<ItemEditorModal[\s>]/.test(src) &&
    (/from ["'].*ItemEditorModal["']|from ["'].*\/ItemEditorModal["']/.test(src) ||
      /import\s*\{\s*ItemEditorModal\s*\}/.test(src))
  );
}

// PICKER-QUICK-CREATE-ENTITY-KIND-TYPE-DRIFT / LST-F3368: vendor/item early-return to the embedded
// canonical Lists creators (same "embeds → check the embedded file instead" shape as newServiceEmbedsItemEditor).
function quickCreateEmbedsVendorModal(src) {
  return /kind\s*===\s*["']vendor["']/.test(src) && /<VendorCreateModal[\s>]/.test(src) && /\bembedded\b/.test(src);
}
function quickCreateEmbedsItemEditor(src) {
  return /kind\s*===\s*["']item["']/.test(src) && /<ItemEditorModal[\s>]/.test(src) && /\bembedded\b/.test(src);
}
function quickCreateEmbedsCustomerForm(src) {
  return /kind\s*===\s*["']customer["']/.test(src) && /<NewCustomerDrawerForm[\s>]/.test(src);
}
// LST-F3370 — category embeds NewAccountDrawerForm → AccountDrawer (createCatalogAccount).
function quickCreateEmbedsAccountCreate(src) {
  return (
    /kind\s*===\s*["']category["']/.test(src) &&
    (/<NewAccountDrawerForm[\s>]/.test(src) || /<AccountDrawer[\s>]/.test(src))
  );
}

// Files whose inline-create submit paths must remain canonical, with the canonical anchor each must keep.
const CANONICAL_SURFACES = [
  {
    file: QUICK_CREATE,
    // Vendor/customer/item/category are embed-aware (see QUICK_CREATE_EMBED_ANCHORS below).
    anchors: [],
  },
  {
    file: NEW_SERVICE,
    anchors: [/itemsCatalogClient\.create\s*\(/, /itemsCatalogClient/, /<ItemEditorModal[\s>]/],
    embedEditor: ITEM_EDITOR,
    embedAnchor: /\bclient\.create\s*\(/,
  },
];

// Embed-aware anchors for QUICK_CREATE only: each checks the surface file directly first, and — if the
// surface delegates that kind to its canonical embedded Lists creator — falls back to asserting the
// anchor lives there instead (same file the picker registry / vendor-type guards already point at).
const QUICK_CREATE_EMBED_ANCHORS = [
  {
    label: "createCustomer",
    directAnchor: /\bcreateCustomer\s*\(/,
    embedsCheck: quickCreateEmbedsCustomerForm,
    embedFile: NEW_CUSTOMER_FORM,
    embedAnchor: /\bcreateCustomer\s*\(/,
  },
  {
    label: "createVendor",
    directAnchor: /\bcreateVendor\s*\(/,
    embedsCheck: quickCreateEmbedsVendorModal,
    embedFile: VENDOR_CREATE_MODAL,
    embedAnchor: /\bcreateVendor\s*\(/,
  },
  {
    label: "itemsCatalogClient.create",
    directAnchor: /itemsCatalogClient\.create\s*\(/,
    embedsCheck: quickCreateEmbedsItemEditor,
    embedFile: ITEM_EDITOR,
    embedAnchor: /\bclient\.create\s*\(/,
  },
  {
    label: "createCatalogAccount",
    directAnchor: /\b(?:createCatalogAccount|chartOfAccountsCatalogClient\.create)\s*\(/,
    embedsCheck: quickCreateEmbedsAccountCreate,
    embedFile: ACCOUNT_DRAWER,
    embedAnchor: /\bcreateCatalogAccount\s*\(/,
    // When QuickCreate embeds NewAccountDrawerForm, that form must still render AccountDrawer.
    preEmbedFile: NEW_ACCOUNT_FORM,
    preEmbedCheck: (src) => /<AccountDrawer[\s>]/.test(src) && /\bembedded\b/.test(src),
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
    if (surface.file === QUICK_CREATE) {
      for (const embedAnchor of QUICK_CREATE_EMBED_ANCHORS) {
        if (embedAnchor.directAnchor.test(src)) continue;
        if (embedAnchor.embedsCheck(src)) {
          if (embedAnchor.preEmbedFile && typeof embedAnchor.preEmbedCheck === "function") {
            const preOverridden = Object.prototype.hasOwnProperty.call(sources, embedAnchor.preEmbedFile);
            const preRaw = preOverridden
              ? sources[embedAnchor.preEmbedFile]
              : fs.existsSync(path.join(repoRoot, embedAnchor.preEmbedFile))
                ? fs.readFileSync(path.join(repoRoot, embedAnchor.preEmbedFile), "utf8")
                : null;
            if (preRaw == null) {
              failures.push(
                `${embedAnchor.preEmbedFile} — MISSING (${QUICK_CREATE} embeds it for canonical ${embedAnchor.label})`,
              );
              continue;
            }
            if (!embedAnchor.preEmbedCheck(stripComments(preRaw))) {
              failures.push(
                `${surface.file} — embeds ${path.basename(embedAnchor.preEmbedFile)} but ${embedAnchor.preEmbedFile} lost AccountDrawer embedded chrome`,
              );
              continue;
            }
          }
          const embedOverridden = Object.prototype.hasOwnProperty.call(sources, embedAnchor.embedFile);
          const embedRaw = embedOverridden
            ? sources[embedAnchor.embedFile]
            : fs.existsSync(path.join(repoRoot, embedAnchor.embedFile))
              ? fs.readFileSync(path.join(repoRoot, embedAnchor.embedFile), "utf8")
              : null;
          if (embedRaw == null) {
            failures.push(`${embedAnchor.embedFile} — MISSING (${QUICK_CREATE} embeds it for canonical ${embedAnchor.label})`);
          } else if (!embedAnchor.embedAnchor.test(stripComments(embedRaw))) {
            failures.push(
              `${surface.file} — embeds ${path.basename(embedAnchor.embedFile)} but ${embedAnchor.embedFile} lost canonical create anchor ${embedAnchor.embedAnchor}`,
            );
          }
        } else {
          failures.push(
            `${surface.file} — lost canonical create anchor ${embedAnchor.directAnchor} (create must write the canonical master table, not a qbo_* mirror)`,
          );
        }
      }
    }
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

  const target = QUICK_CREATE;
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

    // PICKER-QUICK-CREATE-ENTITY-KIND-TYPE-DRIFT: customer/vendor/item create live on EMBEDDED canonical Lists
    // creators, not inline in QuickCreateEntityModal.tsx — so the
    // regression this guard exists for is planted on the embed target, exercised via the sources override.
    const plantEmbed = (label, embedFile, embedRealSrc, mutated, expectFragment) => {
      if (embedRealSrc == null) {
        problems.push(`${embedFile} missing on disk — cannot plant a mutation against it`);
        return;
      }
      if (mutated === embedRealSrc) {
        problems.push(`planted regression "${label}" did not mutate the source — selftest is inert`);
        return;
      }
      const failures = assertInlineCreateCanonical({ ...realSources, [embedFile]: mutated });
      if (!failures.some((f) => f.includes(expectFragment))) {
        problems.push(`planted regression "${label}" was NOT caught — assertion is ineffective`);
      }
    };
    const vendorModalRealSrc = fs.existsSync(path.join(repoRoot, VENDOR_CREATE_MODAL))
      ? fs.readFileSync(path.join(repoRoot, VENDOR_CREATE_MODAL), "utf8")
      : null;
    plantEmbed(
      "vendor-embed-create-swapped-for-mirror",
      VENDOR_CREATE_MODAL,
      vendorModalRealSrc,
      vendorModalRealSrc?.replace(/\bcreateVendor\s*\(/, "createQboVendor("),
      "lost canonical create anchor"
    );
    const customerFormRealSrc = fs.existsSync(path.join(repoRoot, NEW_CUSTOMER_FORM))
      ? fs.readFileSync(path.join(repoRoot, NEW_CUSTOMER_FORM), "utf8")
      : null;
    plantEmbed(
      "customer-embed-create-anchor-removed",
      NEW_CUSTOMER_FORM,
      customerFormRealSrc,
      customerFormRealSrc?.replace(/\bcreateCustomer\s*\(/, "legacyCreateCustomer("),
      "lost canonical create anchor"
    );
    const itemEditorRealSrc = fs.existsSync(path.join(repoRoot, ITEM_EDITOR))
      ? fs.readFileSync(path.join(repoRoot, ITEM_EDITOR), "utf8")
      : null;
    plantEmbed(
      "item-embed-create-anchor-removed",
      ITEM_EDITOR,
      itemEditorRealSrc,
      itemEditorRealSrc?.replace(/\bclient\.create\s*\(/, "legacyClientCreate("),
      "lost canonical create anchor"
    );
    const accountDrawerRealSrc = fs.existsSync(path.join(repoRoot, ACCOUNT_DRAWER))
      ? fs.readFileSync(path.join(repoRoot, ACCOUNT_DRAWER), "utf8")
      : null;
    plantEmbed(
      "category-embed-createCatalogAccount-removed",
      ACCOUNT_DRAWER,
      accountDrawerRealSrc,
      accountDrawerRealSrc?.replace(/\bcreateCatalogAccount\s*\(/, "legacyCreateCatalogAccount("),
      "lost canonical create anchor"
    );
    // Neither direct anchor nor a genuine embed present — the "create vanished entirely" shape.
    plant(
      "vendor-anchor-and-embed-both-lost",
      realSrc.replace(/<VendorCreateModal[\s>]/, "<VendorCreateModalRenamed "),
      "lost canonical create anchor"
    );
    // The customer delegation disappears with no direct canonical create replacing it.
    plant(
      "customer-anchor-and-embed-both-lost",
      realSrc.replace(/<NewCustomerDrawerForm[\s>]/, "<NewCustomerDrawerFormRenamed "),
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
    "[verify-inline-create-writes-canonical] SELFTEST PASS — real sources clean; 8 planted regressions all caught"
  );
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}

#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","dispatch","maintenance","reports"],"cols":["connectivity"],"leafRe":"^record_naming_click_through$","task":"ROUND-363-CUR-B-RECORD-NAMING-CLICK-THROUGH"} */
/**
 * ROUND 363-CUR-B — every cell that NAMES a record opens that record.
 *
 * Owner (ROUND 363): "In QuickBooks everything is clickable and goes somewhere."
 * Guard: static over pages under apps/frontend/src/pages.
 *
 * Detector (conservative, shrink-only):
 *   A page is a "name surface" when it references at least one entity-name field
 *   (account_name, load_number, driver_name, vendor_name, customer_name, unit_number,
 *   document_number, trailer_number, item_name) outside comments.
 *   It is a DEFECT when that page has ZERO EntityLink / AmountLink /
 *   EntityLinkOrTombstone usages — the names cannot open a record. Pages that already
 *   wire some links may still have plain-text cells; those shrink toward zero over PRs.
 *
 * Also pins the Reclassify flagship (owner-measured): grid EntityLink on account/load/
 * driver/unit/trailer/vendor + sortable headers (toggleSort).
 *
 * Usage:
 *   node scripts/verify-record-naming-cells-are-click-through.mjs
 *   node scripts/verify-record-naming-cells-are-click-through.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-record-naming-cells-are-click-through";
const SELFTEST = process.argv.includes("--selftest");
const PAGES = path.join(ROOT, "apps/frontend/src/pages");
const RECLASSIFY = "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx";

/**
 * SHRINK-ONLY — pages that name entities but mount ZERO click-through primitives
 * (EntityLink | AmountLink | EntityLinkOrTombstone). Measured 2026-10-05 after
 * batch 6 (10 -> 4). May only fall.
 */
const ZERO_LINK_BASELINE = 4;

const NAME_FIELD_RE =
  /\b(account_name|load_number|driver_name|vendor_name|customer_name|unit_number|document_number|trailer_number|item_name)\b/g;
const CLICK_THROUGH_RE = /\b(EntityLink|AmountLink|EntityLinkOrTombstone)\b/;
const REGISTER_HREF_FN_RE = /function registerHref\(/;
const REGISTER_HREF_LINK_RE = /<Link\s+to=\{registerHref\(/;

function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walkTsx(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name.startsWith(".")) continue;
    if (ent.name === "__tests__") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsx(p, out);
    else if (/\.tsx$/.test(ent.name) && !/\.test\.tsx$/.test(ent.name)) out.push(p);
  }
  return out;
}

export function pageHasClickThrough(body) {
  if (CLICK_THROUGH_RE.test(body)) return true;
  return REGISTER_HREF_FN_RE.test(body) && REGISTER_HREF_LINK_RE.test(body);
}

export function measureNameSurfaces(srcByRel) {
  const zeroLink = [];
  let nameSurfaceCount = 0;
  for (const [rel, src] of Object.entries(srcByRel)) {
    const body = stripComments(src);
    const names = body.match(NAME_FIELD_RE);
    if (!names || names.length === 0) continue;
    nameSurfaceCount += 1;
    if (!pageHasClickThrough(body)) zeroLink.push(rel);
  }
  return { nameSurfaceCount, zeroLinkCount: zeroLink.length, zeroLink };
}

export function reclassifyFlagshipOk(src) {
  const body = stripComments(src);
  const need = [
    { re: /case\s+"account"\s*:\s*return\s+<EntityLink\s+kind="account"/, label: "account cell EntityLink" },
    { re: /case\s+"load"\s*:\s*return\s+[^;]*<EntityLink\s+kind="load"/, label: "load cell EntityLink" },
    { re: /case\s+"driver"\s*:\s*return\s+[^;]*<EntityLink\s+kind="driver"/, label: "driver cell EntityLink" },
    { re: /case\s+"truck"\s*:\s*return\s+[^;]*<EntityLink\s+kind="unit"/, label: "truck/unit cell EntityLink" },
    { re: /case\s+"vendor"\s*:\s*return\s+[^;]*<EntityLink\s+kind="vendor"/, label: "vendor cell EntityLink" },
    { re: /const toggleSort\s*=/, label: "toggleSort (sortable headers)" },
    { re: /data-testid=\{`reclassify-sort-\$\{c\.sort\}`\}/, label: "reclassify-sort testids" },
    {
      re: /reclassify-account-\$\{a\.account_id\}`[\s\S]{0,800}<EntityLink\s+kind="account"\s+id=\{a\.account_id\}[\s\S]{0,400}stopPropagation/,
      label: "left-pane account tree EntityLink + stopPropagation",
    },
  ];
  const missing = need.filter((n) => !n.re.test(body)).map((n) => n.label);
  return { ok: missing.length === 0, missing };
}

function loadSources() {
  const out = {};
  for (const abs of walkTsx(PAGES)) {
    out[path.relative(ROOT, abs)] = fs.readFileSync(abs, "utf8");
  }
  return out;
}

function main() {
  const fails = [];
  const srcByRel = loadSources();

  if (SELFTEST) {
    const plant = { ...srcByRel };
    // Plant: strip EntityLink from a known linked page so zero-link count rises.
    const victim = Object.keys(plant).find((r) => /EntityLink/.test(plant[r]) && NAME_FIELD_RE.test(stripComments(plant[r])));
    if (!victim) {
      console.error(`${LABEL}: --selftest FAIL — no victim page to plant`);
      process.exit(1);
    }
    plant[victim] = plant[victim]
      .replace(/\bEntityLinkOrTombstone\b/g, "PlainName")
      .replace(/\bEntityLink\b/g, "PlainName")
      .replace(/\bAmountLink\b/g, "PlainAmount");
    const m = measureNameSurfaces(plant);
    if (m.zeroLinkCount <= ZERO_LINK_BASELINE) {
      console.error(`${LABEL}: --selftest FAIL — planted zero-link rise not detected (${m.zeroLinkCount} ≤ ${ZERO_LINK_BASELINE})`);
      process.exit(1);
    }
    const badReclass = reclassifyFlagshipOk(plant[RECLASSIFY]?.replace(/EntityLink/g, "PlainName") ?? "");
    if (badReclass.ok) {
      console.error(`${LABEL}: --selftest FAIL — reclassify plant not detected`);
      process.exit(1);
    }
    console.log(`${LABEL}: --selftest PASS — zero-link plant ${m.zeroLinkCount} > ${ZERO_LINK_BASELINE}; reclassify missing ${badReclass.missing.join(", ")}`);
    process.exit(0);
  }

  const measured = measureNameSurfaces(srcByRel);
  if (measured.zeroLinkCount > ZERO_LINK_BASELINE) {
    fails.push(
      `zero-EntityLink name surfaces ${measured.zeroLinkCount} > baseline ${ZERO_LINK_BASELINE} (shrink-only). Sample: ${measured.zeroLink.slice(0, 8).join(", ")}`,
    );
  }

  const reclassSrc = srcByRel[RECLASSIFY];
  if (!reclassSrc) {
    fails.push(`${RECLASSIFY}: missing — Reclassify flagship required`);
  } else {
    const flag = reclassifyFlagshipOk(reclassSrc);
    if (!flag.ok) fails.push(`${RECLASSIFY}: missing ${flag.missing.join(", ")}`);
  }

  if (fails.length) {
    console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }

  console.log(
    `${LABEL}: PASS — ${measured.nameSurfaceCount} name surfaces; zero-link ${measured.zeroLinkCount} ≤ ${ZERO_LINK_BASELINE}; Reclassify flagship EntityLink+sort OK`,
  );
}

main();

#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LABEL = "verify-inv-verify-01";
const SELFTEST = process.argv.includes("--selftest");
const SIBLINGS = [
  "scripts/verify-inv-s01-parts-roster-density.mjs",
  "scripts/verify-inv-cat-01-category-honesty.mjs",
  "scripts/verify-inv-s02-s03-pick-01.mjs",
  "scripts/verify-inv-link-01-part-vendor.mjs",
];

function run(script) {
  const r = spawnSync(process.execPath, [join(ROOT, script)], { encoding: "utf8" });
  return { script, code: r.status ?? 1, out: ((r.stdout || "") + (r.stderr || "")).slice(0, 240) };
}

function inventoryVerifyLeaf() {
  const completion = JSON.parse(readFileSync(join(ROOT, "docs/module-completion/inventory.json"), "utf8"));
  return completion.items.find((item) => item.id === "INV-VERIFY-01");
}

export function verify(leaf = inventoryVerifyLeaf()) {
  const errs = [];
  const manifest = readFileSync(join(ROOT, "apps/frontend/src/routes/manifest.tsx"), "utf8");
  for (const p of ["/inventory", "/inventory/assignments", "/inventory/purchases"]) {
    if (!manifest.includes(`path="${p}"`)) errs.push(`manifest missing ${p}`);
  }
  for (const s of SIBLINGS) {
    if (!existsSync(join(ROOT, s))) errs.push(`missing ${s}`);
    else {
      const r = run(s);
      if (r.code !== 0) errs.push(`${s} exit ${r.code}: ${r.out}`);
    }
  }
  if (!leaf) errs.push("inventory completion manifest missing INV-VERIFY-01");
  else {
    if (leaf.title !== "Inventory module VERIFY-1..8 — USMCA TMS-native") {
      errs.push("INV-VERIFY-01 must use the owner-closed USMCA TMS-native scope, not stale TRANSP scope");
    }
    if (leaf.prod_verified !== true || !String(leaf.evidence).includes("USMCA LIVE PASS")) {
      errs.push("INV-VERIFY-01 must carry exact USMCA Live evidence and prod_verified=true");
    }
    if (!String(leaf.evidence).includes("TRANSP is explicitly N/A") || !String(leaf.evidence).includes("No save or mutation")) {
      errs.push("INV-VERIFY-01 must state the TRANSP N/A boundary and mutation posture");
    }
  }
  return errs;
}

if (SELFTEST) {
  const real = inventoryVerifyLeaf();
  const planted = [
    verify({ ...real, title: "Inventory module VERIFY-1..8 TRANSP + USMCA" }),
    verify({ ...real, prod_verified: false }),
  ];
  const e = verify();
  if (e.length || planted.some((failures) => failures.length === 0)) { console.error(LABEL, "FAIL", e); process.exit(1); }
  console.log(`${LABEL} --selftest OK — 2/2 planted defects detected`);
} else {
  const e = verify();
  if (e.length) { console.error(LABEL, "FAIL"); e.forEach((x) => console.error(" -", x)); process.exit(1); }
  console.log(`${LABEL} PASS`);
}

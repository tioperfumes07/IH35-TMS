#!/usr/bin/env node
// ROUND 326 queue item 6 (CC-1) — DRIVER ESCROW, 2100 SERIES. Driver escrow is a liability owed to the driver on
// the driver's own 2100-00-0NN sub-account — nothing to do with Faro, factoring or reserves. This guard fails if:
//   1. the Settlement Creator stops starting with the $25 escrow hold line (2,500 cents, type hold);
//   2. an escrow row loses its X (remove) control, or the Escrow section loses its own subtotal;
//   3. the creator's escrow preview resolves anything but the driver's own account
//      (resolveDriverEscrowLiabilityAccount) — escrow_liability_default / account 2400 are the shared default;
//   4. the creator stops attributing a no-load escrow line to the settlement's first load.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-escrow-2100-default-line";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  const drawer = strip(src.drawer);
  if (!/DEFAULT_ESCROW_HOLD_CENTS\s*=\s*2_?500\b/.test(drawer)) p.push("the creator's default escrow hold must be $25 (DEFAULT_ESCROW_HOLD_CENTS = 2_500)");
  if (!/useState<MoneyDraft\[\]>\(\(\)\s*=>\s*\[defaultEscrowLine\(\)\]\)/.test(drawer)) p.push("the Escrow section must start with the default $25 line (useState(() => [defaultEscrowLine()]))");
  if (!/aria-label="Remove escrow line"[\s\S]{0,300}setEscrow\(escrow\.filter\(/.test(drawer)) p.push("every escrow row needs its X (Remove escrow line -> setEscrow(escrow.filter(...)))");
  if (!/title="Escrow"\s+subtotalCents=\{escrowNet\}/.test(drawer)) p.push("the Escrow section must show its own subtotal (subtotalCents={escrowNet})");
  const creator = strip(src.creator);
  const block = creator.slice(creator.indexOf("let escrowCents = 0;"), creator.indexOf("let advanceCents = 0;"));
  if (!block || !/resolveDriverEscrowLiabilityAccount\(/.test(block)) p.push("the creator's escrow preview must resolve the driver's own 2100-00-0NN account (resolveDriverEscrowLiabilityAccount)");
  if (/escrow_liability_default|"2400"/.test(block)) p.push("the creator's escrow preview falls back to the shared escrow default / 2400");
  if (!/resolveLoadIdByNumber\(e\.load_number\?\.trim\(\) \|\| draft\.loads\?\.\[0\]\?\.load_number\)/.test(creator)) p.push("a no-load escrow line must belong to the settlement's first load");
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
      ["no default line", { ...src, drawer: src.drawer.replace("[defaultEscrowLine()]", "[]") }],
      ["default not $25", { ...src, drawer: src.drawer.replace("DEFAULT_ESCROW_HOLD_CENTS = 2_500", "DEFAULT_ESCROW_HOLD_CENTS = 25_000") }],
      ["X removed", { ...src, drawer: src.drawer.replace('aria-label="Remove escrow line"', 'aria-label="x"') }],
      ["shared default back", { ...src, creator: src.creator.replace("const liab = driverEscrow;", 'const liab = await accountByRole(client, o, "escrow_liability_default");') }],
      ["no first-load fallback", { ...src, creator: src.creator.replace("e.load_number?.trim() || draft.loads?.[0]?.load_number", "e.load_number") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — creator starts with the $25 driver escrow line (X removes it, own subtotal); escrow resolves the driver's own 2100-00-0NN liability.`);
}

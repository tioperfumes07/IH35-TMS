#!/usr/bin/env node
/**
 * CLS-EQUIPMENT-TRIP-LINKAGE — trailer≡unit + load↔trip events.
 *
 * Owner 2026-08-12:
 *  1) Trailers (incl. reefers) follow everything trucks do → any leaf that
 *     Requires `unit` MUST Require `trailer`. Reefers → fuel/expense + load.
 *  2) When a truck/trailer is on a trip, load MUST link to repairs, maintenance,
 *     safety incidents, accidents, insurance claims, etc. → any leaf that
 *     Requires work_order / accident / claim / scenario.maintenance /
 *     scenario.insurance MUST Require `load`.
 *
 * Usage:
 *   node scripts/verify-trailer-unit-linkage-parity.mjs
 *   node scripts/verify-trailer-unit-linkage-parity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MOD_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");

const TRIP_EVENT_COLS = [
  "work_order",
  "accident",
  "claim",
  "scenario.maintenance",
  "scenario.insurance",
];

function run() {
  const errors = [];
  let unitLeaves = 0;
  let tripEventLeaves = 0;
  const trailerColMissing = [];

  for (const f of fs.readdirSync(MOD_DIR).filter((x) => x.endsWith(".required.json"))) {
    const doc = JSON.parse(fs.readFileSync(path.join(MOD_DIR, f), "utf8"));
    const colIds = new Set((doc.columns || []).map((c) => c.id));
    if (!colIds.has("trailer")) trailerColMissing.push(doc.module || f);
    if (!colIds.has("load")) errors.push(`${doc.module || f}: missing load column`);

    for (const leaf of doc.leaves || []) {
      const req = leaf.required || [];
      if (req.includes("unit")) {
        unitLeaves += 1;
        if (!req.includes("trailer")) {
          errors.push(`${doc.module}.${leaf.id}: requires unit but not trailer`);
        }
      }
      const hit = TRIP_EVENT_COLS.filter((c) => req.includes(c));
      if (hit.length) {
        tripEventLeaves += 1;
        if (!req.includes("load")) {
          errors.push(
            `${doc.module}.${leaf.id}: trip-event cols [${hit.join(",")}] require load (repairs/maint/safety/accident/insurance on a trip)`,
          );
        }
      }
    }

    if (doc.module === "fuel") {
      const ids = new Set((doc.leaves || []).map((l) => l.id));
      if (!ids.has("reefer") && !ids.has("fuel.reefer")) {
        errors.push("fuel.required.json missing reefer fuel leaf (trailer fuel parity)");
      }
      // Owner 2026-08-12 — fuel EVENT surfaces link to the FULL hub (not a thin subset).
      const FUEL_FULL_HUB = [
        "driver",
        "customer",
        "vendor",
        "unit",
        "trailer",
        "load",
        "ap_bill",
        "expense",
        "gl_je",
        "invoice",
        "bank",
        "connectivity",
        "reverse_link",
        "picker_law",
        "qbo_chrome",
      ];
      const FUEL_CHROME_ONLY = new Set([
        "settings",
        "loves_prices",
        "chrome.toolbar_search",
        "chrome.toolbar_range",
        "chrome.toolbar_gear",
      ]);
      for (const leaf of doc.leaves || []) {
        if (FUEL_CHROME_ONLY.has(leaf.id)) continue;
        const req = new Set(leaf.required || []);
        const miss = FUEL_FULL_HUB.filter((c) => !req.has(c));
        if (miss.length) {
          errors.push(`fuel.${leaf.id}: ops fuel leaf missing full hub cols: ${miss.join(",")}`);
        }
      }
    }

    if (doc.module === "fleet") {
      const reefer = (doc.leaves || []).find((l) => l.id === "trailer.profile.reefer");
      if (!reefer) {
        errors.push("fleet.required.json missing trailer.profile.reefer");
      } else {
        for (const col of ["trailer", "load", "expense"]) {
          if (!(reefer.required || []).includes(col)) {
            errors.push(`fleet.trailer.profile.reefer missing required ${col}`);
          }
        }
      }
    }
  }

  if (trailerColMissing.length) {
    errors.push(`modules missing trailer column: ${trailerColMissing.join(", ")}`);
  }

  if (errors.length) {
    console.error("verify-trailer-unit-linkage-parity FAIL:");
    for (const e of errors.slice(0, 50)) console.error(" -", e);
    if (errors.length > 50) console.error(` - … +${errors.length - 50} more`);
    process.exit(1);
  }
  console.log(
    `verify-trailer-unit-linkage-parity OK — ${unitLeaves} unit→trailer; ${tripEventLeaves} trip-event→load; fuel reefer + fleet trailer.profile.reefer`,
  );
}

function selftest() {
  const target = path.join(MOD_DIR, "maintenance.required.json");
  const bak = fs.readFileSync(target, "utf8");
  try {
    const doc = JSON.parse(bak);
    for (const leaf of doc.leaves || []) {
      leaf.required = (leaf.required || []).filter((c) => c !== "load");
    }
    fs.writeFileSync(target, JSON.stringify(doc, null, 2) + "\n");
    const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (red.status === 0) {
      console.error("selftest FAIL — expected red after stripping load from maintenance");
      process.exit(1);
    }
    console.log("selftest OK — red when load stripped from trip-event leaves");
  } finally {
    fs.writeFileSync(target, bak);
  }
  const green = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (green.status !== 0) {
    console.error(green.stderr || green.stdout);
    console.error("selftest FAIL — expected green after restore");
    process.exit(1);
  }
  console.log("selftest OK — green on restore");
}

if (process.argv.includes("--selftest")) selftest();
else run();

#!/usr/bin/env node
/**
 * verify-no-retired-driver-employment-status-read (DRV-04)
 *
 * THE DEFECT. mdata.drivers has TWO employment-status fields: the retired free-text column
 * `employment_status`, and the canonical FK `driver_employment_status_id` -> reference.employment_statuses.
 * Verified on br-fancy-credit-akjnd07a 2026-07-27 under the lucia bypass, positive control
 * mdata.drivers = 178:
 *     employment_status IS NOT NULL              ->   0 of 178
 *     driver_employment_status_id IS NOT NULL    -> 178 of 178
 * The retired column has no writer. Any surface reading it renders empty for every driver, forever.
 *
 * WHY IT SURVIVED. components/driver-profile/IdentityHeader.tsx read the retired column with a
 * fallback chain — `employment_status || pay_basis || "—"`. A wrong value would have been noticed; a
 * silent fallback to another field just looks like sparse data. That is the whole failure mode: the
 * header appeared merely blank, not broken, on the driver profile of all 178 drivers.
 *
 * WHAT THIS ASSERTS. No frontend surface reads `.employment_status` off a driver-ish object. The
 * canonical read is the reference-FK label (driver_employment_status_label) or, where an id is
 * genuinely needed, driver_employment_status_id. Backend is deliberately out of scope: bulk-import
 * and migration code legitimately touch the retired column while it is being drained, and this guard
 * exists to stop it reaching a SCREEN.
 *
 * Usage: node scripts/verify-no-retired-driver-employment-status-read.mjs [--selftest]
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const LABEL = "verify-no-retired-driver-employment-status-read";
const SCAN_DIR = "apps/frontend/src";

export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function retiredReadProblems(path, rawSrc) {
  const out = [];
  const src = stripComments(rawSrc);

  // Match a property read of `employment_status` that is NOT part of the canonical identifiers
  // driver_employment_status_id / driver_employment_status_label / driver_employment_status_code.
  const re = /(?<![a-z_])(?<!driver_)employment_status(?!_id|_label|_code)\b/g;
  for (const m of src.matchAll(re)) {
    const line = src.slice(0, m.index).split("\n").length;
    out.push(
      `${path}:${line} reads the RETIRED mdata.drivers.employment_status column — populated on 0 of 178 drivers on prod, with no writer. Read driver_employment_status_label (reference.employment_statuses, populated 178/178) instead; a fallback chain here renders blank for every driver and looks like sparse data rather than a defect.`
    );
  }
  return out;
}

function collectFiles() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        out.push({ path: full.replace(`${ROOT}/`, ""), src: readFileSync(full, "utf8") });
      }
    }
  };
  walk(resolve(ROOT, SCAN_DIR));
  return out;
}

function run() {
  const files = collectFiles();
  const problems = files.flatMap(({ path, src }) => retiredReadProblems(path, src));
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(`[${LABEL}] OK — ${files.length} frontend file(s) scanned; no surface reads the retired employment_status column`);
  return true;
}

function selftest() {
  let ok = true;

  if (!run()) {
    console.error("SELFTEST FAIL: the real tree is flagged — false positive");
    ok = false;
  }

  const cases = [
    ["the exact DRV-04 defect", `const employment = driver.employment_status ? String(driver.employment_status) : "—";`, true],
    ["destructured retired column", `const { employment_status } = driver;`, true],
    ["canonical label — MUST NOT be flagged", `const employment = driver_employment_status_label ?? "—";`, false],
    ["canonical id — MUST NOT be flagged", `body.driver_employment_status_id = id;`, false],
    ["canonical code — MUST NOT be flagged", `row.driver_employment_status_code`, false],
    ["mentioned only in a comment", `// the retired employment_status column is gone\nconst x = 1;`, false],
  ];

  for (const [name, src, shouldFlag] of cases) {
    const flagged = retiredReadProblems("fixture.tsx", src).length > 0;
    if (flagged !== shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' expected flagged=${shouldFlag}, got ${flagged}`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> flagged=${flagged} as expected`);
    }
  }

  // Re-plant the defect into the real repaired file — proves the guard protects the file it fixed.
  const target = "apps/frontend/src/components/driver-profile/IdentityHeader.tsx";
  const real = readFileSync(resolve(ROOT, target), "utf8");
  const reverted = real.replace(
    /const employment = employmentStatusLabel/,
    "const employment = driver.employment_status ? String(driver.employment_status) : employmentStatusLabel"
  );
  if (reverted === real) {
    console.error("SELFTEST FAIL: could not re-plant the defect into IdentityHeader — the case proves nothing");
    ok = false;
  } else if (!retiredReadProblems(target, reverted).length) {
    console.error("SELFTEST FAIL: re-planting the retired-column read into IdentityHeader was not caught");
    ok = false;
  } else {
    console.log("SELFTEST: re-planting the retired-column read into IdentityHeader -> caught");
  }

  if (!ok) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);

#!/usr/bin/env node
/**
 * SAF-F3486 — HoursOfServicePage keeps server-bound fleetSearch; ParityTable must
 * pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/safety/HoursOfServicePage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkPage(src) {
  assert(src.includes("ParityTable"), "HoursOfServicePage: must use ParityTable");
  assert(/type=["']search["']/.test(src), "HoursOfServicePage: must keep server-bound type=search");
  assert(/fleetSearch/.test(src), "HoursOfServicePage: must keep fleetSearch API binding");
  assert(
    /suppressToolbarSearch/.test(src),
    "HoursOfServicePage: ParityTable must pass suppressToolbarSearch",
  );
  leftoverRefuse(src);
}

function leftoverRefuse(src) {
  if (src.includes("text-[11px]")) throw new Error("HoursOfServicePage: leftover text-[11px]");
  if (src.includes("#8A92AB") || src.includes("#334155")) {
    throw new Error("HoursOfServicePage: leftover off-scale muted");
  }
}

function selftest() {
  const full = path.join(ROOT, PAGE);
  const good = fs.readFileSync(full, "utf8");
  checkPage(good);
  const bad = good.replace(/\n\s*\/\/ SAF-F3486:[\s\S]*?suppressToolbarSearch\n/, "\n");
  let failed = false;
  try {
    checkPage(bad);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  const leftoverPlant = `${good}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`;
  let leftoverFailed = false;
  try {
    checkPage(leftoverPlant);
  } catch {
    leftoverFailed = true;
  }
  assert(leftoverFailed, "selftest: leftover plant escaped");
  console.log("verify-safety-hos-dashboard-suppress-toolbar-search --selftest PASS + leftover plant rejected");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-safety-hos-dashboard-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkPage(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
    console.log(
      "verify-safety-hos-dashboard-suppress-toolbar-search PASS — Safety HOS suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-safety-hos-dashboard-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}

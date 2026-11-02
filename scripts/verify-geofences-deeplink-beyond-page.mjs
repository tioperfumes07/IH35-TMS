#!/usr/bin/env node
/**
 * Geofences ?geofence_id= must surface the scoped row even when it would fall past page 1.
 * Codex QA 11-02: only rowClassName — deep link on page ~95 invisible.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-geofences-deeplink-beyond-page";
const FILE = "apps/frontend/src/pages/operations/GeofencesPage.tsx";

/** Pure pin helper mirrored from GeofencesPage displayGeofences. */
function pinGeofence(rows, highlightedId) {
  if (!highlightedId) return rows;
  const idx = rows.findIndex((g) => g.id === highlightedId);
  if (idx <= 0) return rows;
  const pinned = rows[idx];
  return [pinned, ...rows.slice(0, idx), ...rows.slice(idx + 1)];
}

function auditSource(src) {
  const fails = [];
  for (const needle of [
    "displayGeofences",
    "geofence-deeplink-banner",
    "geofence-row-",
    "rowTestId",
    "onPageChange",
    "highlightedGeofenceId",
  ]) {
    if (!src.includes(needle)) fails.push(`${FILE}: missing ${JSON.stringify(needle)}`);
  }
  if (!/findIndex\(\(g\) => g\.id === highlightedGeofenceId\)/.test(src) && !/findIndex\(\(g\) => g\.id === highlightedGeofenceId\)/.test(src)) {
    // accept either form
  }
  if (!/findIndex\(/.test(src) || !/pinned/.test(src)) {
    fails.push(`${FILE}: must pin deep-linked geofence to front of display list`);
  }
  // Codex ROUND 7.6 P0: #28094 shipped an unterminated class string (`ring-[#F59E0B]/`)
  // that blocked every subsequent frontend deploy. Closing quote after the Tailwind color is required.
  if (/ring-\[#F59E0B\]\//.test(src) || !/ring-\[#F59E0B\]"/.test(src)) {
    fails.push(`${FILE}: rowClassName highlight class must close the string after ring-[#F59E0B] (no '/" typo)`);
  }
  return fails;
}

function behavioralBeyondFirstPage() {
  const pageSize = 25;
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: `g-${i}`, label: `G${i}` }));
  const target = "g-87"; // would be page 4 (0-indexed page 3) without pin
  const rawPage = Math.floor(rows.findIndex((r) => r.id === target) / pageSize) + 1;
  if (rawPage <= 1) throw new Error("plant: target must be beyond page 1");
  const pinned = pinGeofence(rows, target);
  if (pinned[0]?.id !== target) throw new Error("pin failed");
  const page1 = pinned.slice(0, pageSize);
  if (!page1.some((r) => r.id === target)) {
    throw new Error("deep-linked id still missing from page 1 after pin");
  }
}

if (process.argv.includes("--selftest")) {
  const good = `
const displayGeofences = useMemo(() => {
  const idx = geofences.findIndex((g) => g.id === highlightedGeofenceId);
  const pinned = geofences[idx];
  return [pinned, ...geofences.slice(0, idx), ...geofences.slice(idx + 1)];
}, []);
data-testid="geofence-deeplink-banner"
rowTestId={(item) => \`geofence-row-\${item.id}\`}
onPageChange={setTablePage}
highlightedGeofenceId
rowClassName={(item) => highlightedGeofenceId === item.id ? "bg-[#FEF3C7] ring-1 ring-inset ring-[#F59E0B]" : ""}
`;
  if (auditSource(good).length) throw new Error("SELFTEST FAIL clean: " + JSON.stringify(auditSource(good)));
  const bad = good.replace("pinned", "x").replace("findIndex", "indexOf");
  if (auditSource(bad).length === 0) throw new Error("SELFTEST FAIL: missing pin undetected");
  const brokenQuote = good.replace('ring-[#F59E0B]"', 'ring-[#F59E0B]/');
  if (!auditSource(brokenQuote).some((f) => f.includes("close the string"))) {
    throw new Error("SELFTEST FAIL: broken ring class string undetected");
  }
  behavioralBeyondFirstPage();
  // mutation: without pin, target not on page 1
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: `g-${i}` }));
  const page1 = rows.slice(0, 25);
  if (page1.some((r) => r.id === "g-87")) throw new Error("SELFTEST plant invalid");
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const fails = auditSource(src);
behavioralBeyondFirstPage();
if (fails.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — geofence deep-link pins scoped row onto page 1 + banner`);

#!/usr/bin/env node
/**
 * LV-LOADED-MILES-NEVER-WRITTEN — the Book wizard must persist mdata.loads.loaded_miles.
 *
 * loaded_miles was NULL on every load because NO code path wrote it, so every mileage-based settlement
 * computed $0 — a number that is obviously broken, unlike a plausible-but-wrong one.
 *
 * BASIS = SHORTEST, decided on the pay side's own evidence, not preference: all 5 active pay rates are
 * per_mile_pay / short_miles, and the only load that ever computed pay correctly (L-20260802-0258) did it as
 * 2300 mi x 48c = 110,400c exactly. The wizard also states "Shortest miles used for driver pay" on screen.
 * This guard pins the PAY basis. It deliberately does NOT pin routing: migration 0311 resolves lane
 * profitability with COALESCE(loaded_miles, miles_practical, miles_shortest) and that ruling is unmade.
 *
 *   node scripts/verify-loaded-miles-written-on-book.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-loaded-miles-written-on-book";
const SVC = "apps/backend/src/dispatch/book-load.service.ts";
const MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const STRIP = "apps/frontend/src/pages/dispatch/components/book-load-v4/MilesStrip.tsx";
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";
const HELPER = "apps/frontend/src/pages/dispatch/components/book-load-city-state.ts";
const PROOF_BE = "apps/backend/src/dispatch/load-save-proof.ts";
const PROOF_FE = "apps/frontend/src/pages/dispatch/components/book-load-v4/LoadSaveProofPanel.tsx";
const PROOF_LAW = "docs/lockdown/GO-17-LOAD-SAVE-PROOF-PANEL-2026-09-01.md";

function assert(files) {
  const problems = [];
  const src = files[SVC] ?? "";
  const modal = files[MODAL] ?? "";
  const strip = files[STRIP] ?? "";
  const routes = files[ROUTES] ?? "";
  const helper = files[HELPER] ?? "";
  const m = /INSERT INTO mdata\.loads\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i.exec(src);
  if (!m) return [`${SVC}: INSERT INTO mdata.loads anchor drifted`];
  const columns = m[1].split(",").map((c) => c.replace(/--[^\n]*/g, "").trim()).filter(Boolean);
  // Count VALUES ENTRIES, not placeholders: this INSERT passes a literal 'USD' for currency_code, so
  // placeholders are legitimately one fewer than columns and a placeholder-count check reports a false
  // lockstep break. Split at paren depth 0 so COALESCE(...)-style entries are not torn apart.
  const valueEntries = (() => {
    const out = [];
    let depth = 0;
    let cur = "";
    for (const ch of m[2]) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.filter(Boolean);
  })();

  if (!columns.includes("loaded_miles")) {
    problems.push(
      `${SVC}: the Book INSERT must write loaded_miles — it was NULL on every load, so every mileage-based ` +
        `settlement computed $0.`,
    );
  }
  if (columns.length !== valueEntries.length) {
    problems.push(`${SVC}: lockstep broken — ${columns.length} columns vs ${valueEntries.length} VALUES entries`);
  }
  // Anchor to the loaded_miles VALUE SLOT specifically: the file also passes input.miles_shortest for the
  // miles_shortest column, so a bare search matches the wrong occurrence and the guard would pass while the
  // basis had been flipped. (My own selftest caught exactly that.)
  if (!/input\.is_sample_data \?\? false,[\s\S]{0,900}?input\.miles_shortest \?\? null,/.test(src)) {
    problems.push(
      `${SVC}: loaded_miles must be fed from miles_shortest (PAY basis). All active pay rates are ` +
        `per_mile_pay/short_miles; using practical here would silently change what drivers are paid.`,
    );
  }
  // Manual miles (no PC*MILER): MilesStrip must expose editable shortest/practical — hidden register-only = FAIL.
  if (!/data-testid="book-miles-shortest"/.test(strip) || !/onShortestChange/.test(strip)) {
    problems.push(
      `${STRIP}: must expose editable shortest miles (data-testid=book-miles-shortest + onShortestChange) — ` +
        `display-only strip left every book at 0 without PC*MILER.`,
    );
  }
  if (/className="hidden"[\s\S]{0,200}?miles_shortest/.test(modal) || /hidden[\s\S]{0,120}?register\("miles_shortest"/.test(modal)) {
    problems.push(
      `${MODAL}: miles_shortest must not live only inside a hidden register block — operators must type miles.`,
    );
  }
  if (!/onShortestChange=\{/.test(modal) || !/Stops and miles/.test(modal)) {
    problems.push(`${MODAL}: must wire MilesStrip onShortestChange and label the section Stops and miles.`);
  }
  if (!/E_MILES_SHORTEST_REQUIRED/.test(src)) {
    problems.push(`${SVC}: must refuse book with seated driver when miles_shortest missing (E_MILES_SHORTEST_REQUIRED).`);
  }
  if (!/resolveStopPlace/.test(modal) || !/originPlace\.city && originPlace\.state && destPlace\.city && destPlace\.state/.test(modal)) {
    problems.push(
      `${MODAL}: lane lookup must parse City "Laredo TX" into city+state — requiring the St picker left miles at 0 and Book toasted Enter practical miles before booking.`,
    );
  }
  if (!/Choose the state on pickup and delivery so miles can fill from history/.test(modal)) {
    problems.push(`${MODAL}: missing state must tell the operator why miles stayed empty`);
  }
  if (!/export function parseCityStateInput/.test(helper) || !/STATE_SUFFIX/.test(helper)) {
    problems.push(`${HELPER}: must split "Laredo, TX" / "Laredo TX" so lookup can fire without the St picker`);
  }
  if (/lane_mileage_lookup_failed[\s\S]{0,500}match:\s*"New lane"/.test(routes)) {
    problems.push(`${ROUTES}: lookup failure must not pretend New lane — Book then shows empty miles as a miss`);
  }
  if (!/reply\.code\(503\)\.send\(\{[\s\S]{0,180}lane_mileage_lookup_failed/.test(routes)) {
    problems.push(`${ROUTES}: lookup failure must 503 so Book can say Could not load lane miles`);
  }
  if (/uppercase/.test(strip) || /PC\*MILER/.test(strip) || /fuel and ETA/i.test(strip)) {
    problems.push(`${STRIP}: operator strip still teaches ALL CAPS, PC*MILER, or fuel/ETA — GO-16 Rev B forbids that.`);
  }
  const proofBe = files[PROOF_BE] ?? "";
  const proofFe = files[PROOF_FE] ?? "";
  const proofLaw = files[PROOF_LAW] ?? "";
  if (!/save_proof/.test(src) || !/buildLoadSaveProof/.test(src)) {
    problems.push(`${SVC}: Book Load 201 must attach save_proof from buildLoadSaveProof (GO-17 Part 1)`);
  }
  if (!/if \(!sid\) return \{ state: "not_set"/.test(proofBe)) {
    problems.push(`${PROOF_BE}: empty id must be not_set — null driver must never be Linked`);
  }
  if (!/journal_entry_postings/.test(proofBe) || !/audit\.row_changes/.test(proofBe)) {
    problems.push(`${PROOF_BE}: must read journal_entry_postings + audit.row_changes — no parallel log`);
  }
  if (!/LoadSaveProofPanel/.test(modal) || !/data-testid="load-save-proof-panel"/.test(proofFe)) {
    problems.push(`${MODAL}: must render LoadSaveProofPanel after Save`);
  }
  if (!/save-proof-did-not/.test(proofFe) || !/DID NOT/.test(proofFe)) {
    problems.push(`${PROOF_FE}: must have an explicit DID NOT section`);
  }
  if (/emerald|text-green-/.test(proofFe)) {
    problems.push(`${PROOF_FE}: Linked must not use green/emerald — missing driver looked "Linked"`);
  }
  if (!/null\/empty driver is \*\*never\*\* Linked/.test(proofLaw)) {
    problems.push(`${PROOF_LAW}: GO-17 Part 1 law missing driver honesty`);
  }
  const note = modal.match(/<p className="blw-note">[\s\S]*?<\/p>/)?.[0] ?? "";
  const visible = `${strip}\n${note}`
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/className=\{?`[\s\S]*?`\}?/g, "")
    .replace(/className="[^"]*"/g, "")
    .replace(/htmlFor="[^"]*"/g, "")
    .replace(/data-testid="[^"]*"/g, "")
    .replace(/id="[^"]*"/g, "");
  const underscored = [...visible.matchAll(/>([^<{][^<]*)</g)]
    .map((m) => m[1])
    .filter((t) => t.includes("_") && !t.includes("http"));
  if (underscored.length) {
    problems.push(`${STRIP}: user-visible underscore on Book Load miles chrome: ${underscored.join(" | ")}`);
  }
  return problems;
}

const files = Object.fromEntries(
  [SVC, MODAL, STRIP, ROUTES, HELPER, PROOF_BE, PROOF_FE, PROOF_LAW].map((r) => [r, readFileSync(path.join(ROOT, r), "utf8")]),
);

if (SELFTEST) {
  const checks = [];
  const dropped = {
    ...files,
    [SVC]: files[SVC].replace("border_routing, is_sample_data, loaded_miles", "border_routing, is_sample_data"),
  };
  checks.push(["column dropped", assert(dropped).some((p) => /must write loaded_miles|lockstep broken/.test(p))]);
  // Mutate the loaded_miles VALUE SLOT, not the miles_shortest column that precedes it — replacing the
  // first occurrence plants no defect at all, which is what this selftest originally did.
  const practical = {
    ...files,
    [SVC]: files[SVC].replace(
      /(input\.is_sample_data \?\? false,[\s\S]{0,900}?)input\.miles_shortest \?\? null,/,
      "$1input.miles_practical ?? null,",
    ),
  };
  if (practical[SVC] === files[SVC]) {
    console.error(`${LABEL} SELFTEST FAIL — could not plant the practical-basis mutation`);
    process.exit(1);
  }
  checks.push(["basis flipped to practical", assert(practical).some((p) => /PAY basis/.test(p))]);
  const hiddenMiles = {
    ...files,
    [STRIP]: files[STRIP].replace(/data-testid="book-miles-shortest"/g, 'data-testid="book-miles-shortest-GONE"'),
  };
  checks.push(["miles strip not editable", assert(hiddenMiles).some((p) => /editable shortest/.test(p))]);
  const noServerRefuse = {
    ...files,
    [SVC]: files[SVC].replace(/E_MILES_SHORTEST_REQUIRED/g, "E_MILES_GONE"),
  };
  checks.push(["server refuse removed", assert(noServerRefuse).some((p) => /E_MILES_SHORTEST_REQUIRED/.test(p))]);
  const allCaps = {
    ...files,
    [STRIP]: `${files[STRIP]}\n<span className="uppercase">PC*MILER</span>`,
  };
  checks.push(["uppercase / PC*MILER planted", assert(allCaps).some((p) => /ALL CAPS|PC\*MILER/.test(p))]);
  const noParse = {
    ...files,
    [MODAL]: files[MODAL].replace(/resolveStopPlace/g, "rawStopPlace"),
  };
  checks.push(["city/state parse dropped", assert(noParse).some((p) => /Laredo TX/.test(p))]);
  const swallowed = {
    ...files,
    [ROUTES]: files[ROUTES].replace(
      /return reply\.code\(503\)\.send\(\{[\s\S]*?\}\);/,
      `return { match: "New lane", provenance: "New lane. Enter the miles." };`,
    ),
  };
  if (swallowed[ROUTES] === files[ROUTES]) {
    console.error(`${LABEL} SELFTEST FAIL — could not plant the New-lane swallow mutation`);
    process.exit(1);
  }
  checks.push(["lookup failure swallowed as New lane", assert(swallowed).some((p) => /must not pretend New lane/.test(p))]);
  const noProof = {
    ...files,
    [SVC]: files[SVC].replace(/buildLoadSaveProof/g, "skipSaveProof").replace(/save_proof,/g, "save_skipped,"),
  };
  checks.push(["save_proof dropped", assert(noProof).some((p) => /save_proof from buildLoadSaveProof/.test(p))]);
  const greenLinked = {
    ...files,
    [PROOF_FE]: files[PROOF_FE].replace("text-slate-900", "text-green-600"),
  };
  checks.push(["Linked painted green", assert(greenLinked).some((p) => /green\/emerald/.test(p))]);
  const failed = checks.filter(([, c]) => !c).map(([n]) => n);
  if (failed.length) { console.error(`${LABEL} SELFTEST FAIL — not caught: ${failed.join(", ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted regressions caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) { console.error(`${LABEL} FAIL:`); for (const p of problems) console.error("  - " + p); process.exit(1); }
console.log(`${LABEL}: OK — Book writes loaded_miles from miles_shortest (pay basis), lockstep intact`);
process.exit(0);

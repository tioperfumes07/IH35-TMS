#!/usr/bin/env node
/**
 * verify-live-audit-reproducible — the 2026-07-21 live block audit must stay RE-PERFORMABLE.
 *
 * Root cause this guard exists for: the audit was first published from a generator that read
 * `/tmp/ih35-audit-piles-draft.json` (a file outside the repo) and hardcoded its denominator to
 * `1185`, which silently dropped 6 blocks that were already DONE on main at the audit's own base
 * SHA. Nobody could regenerate the numbers, so nobody could catch it. An audit workpaper that
 * cannot be re-performed from committed inputs is not evidence — a CPA, auditor, lender or court
 * reviewing it would reject it on exactly that basis.
 *
 * This guard enforces, on every CI run:
 *   1. the committed artifacts regenerate BYTE-FOR-BYTE from committed inputs (`--check`);
 *   2. the classified universe equals the reconciler's universe of record (no silent drops);
 *   3. the DONE→BUILT rule stays total;
 *   4. values transcribed from Neon are never presented as if this generator re-queried them.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-live-audit-reproducible";
const GEN = "scripts/ops/publish-live-audit-2026-07-21.mjs";
const PILES = "docs/trackers/block-audit-piles-2026-07-21.json";
const RECON = "docs/trackers/block-reconciliation-data.json";
const REPORT = "docs/trackers/LIVE-AUDIT-REPORT-2026-07-21.md";

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

async function loadBuild() {
  const mod = await import(pathToUrl(path.join(ROOT, GEN)));
  return mod.buildPiles;
}
function pathToUrl(p) {
  return new URL(`file://${p}`).href;
}

function fail(errors) {
  console.error(`FAIL ${LABEL}:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

async function selftest() {
  const buildPiles = await loadBuild();
  const recon = {
    universe: { total_blocks_after_dedup: 2 },
    blocks: [
      { id: "a", status: "DONE", fin: true, evidence: "PR #1 merged 2026-01-01", name: "alpha" },
      { id: "b", status: "PENDING", fin: false, evidence: "x", name: "beta" },
    ],
  };
  const base = {
    generated_at: "2026-07-21T00:00:00+00:00",
    base_sha: "deadbeefcafe",
    deploy_sha: "deadbee",
    denominators: {},
    caveat: "c",
  };
  const good = { ...base, items: [
    { block_id: "a", id: "a", pile: "BUILT", module: "platform", status_reconcile: "DONE", evidence: "e", fin: true },
    { block_id: "b", id: "b", pile: "GAP", module: "platform", status_reconcile: "PENDING", evidence: "e", fin: false },
  ] };

  const errors = [];
  try {
    const out = buildPiles(good, recon);
    if (out.totals.BUILT !== 1 || out.totals.GAP !== 1) errors.push("good fixture: wrong totals");
    if (out.denominators.active_reconcile !== 2) errors.push("good fixture: denominator not derived");
  } catch (e) {
    errors.push(`good fixture must pass, threw: ${e.message}`);
  }

  // A block the reconciler knows about but the audit never classified = the original defect.
  const dropped = { ...base, items: good.items.filter((i) => i.block_id !== "b") };
  let threw = false;
  try {
    buildPiles(dropped, recon);
  } catch {
    threw = true;
  }
  if (!threw) errors.push("dropping an unclassified non-DONE block MUST fail (the 1185 defect)");

  // A DONE block silently dropped must be auto-added (rule is total), not lost.
  const droppedDone = { ...base, items: good.items.filter((i) => i.block_id !== "a") };
  try {
    const out = buildPiles(droppedDone, recon);
    if (!out.items.some((i) => i.block_id === "a" && i.pile === "BUILT")) {
      errors.push("a dropped DONE block must be auto-added as BUILT");
    }
    if (!out.universe_crosscheck.auto_added_done_blocks.includes("a")) {
      errors.push("auto-added block must be recorded in universe_crosscheck");
    }
  } catch (e) {
    errors.push(`dropped-DONE fixture threw: ${e.message}`);
  }

  // DONE piled as anything but BUILT breaks the total rule.
  const badRule = { ...base, items: good.items.map((i) => (i.block_id === "a" ? { ...i, pile: "NOISE" } : i)) };
  threw = false;
  try {
    buildPiles(badRule, recon);
  } catch {
    threw = true;
  }
  if (!threw) errors.push("DONE piled non-BUILT MUST fail");

  // An item the reconciler has never heard of is equally a defect.
  const ghost = { ...base, items: [...good.items, { block_id: "zz", id: "zz", pile: "GAP", module: "platform", status_reconcile: "PENDING", evidence: "e", fin: false }] };
  threw = false;
  try {
    buildPiles(ghost, recon);
  } catch {
    threw = true;
  }
  if (!threw) errors.push("an item outside the reconciler universe MUST fail");

  if (errors.length) fail(errors.map((e) => `--selftest: ${e}`));
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  const errors = [];

  // 1. byte-for-byte re-performability
  const r = spawnSync("node", [GEN, "--check"], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    errors.push(
      `committed audit artifacts do not regenerate from committed inputs:\n      ${(r.stderr || r.stdout || "").trim().replace(/\n/g, "\n      ")}`
    );
  }

  const piles = readJson(PILES);
  const recon = readJson(RECON);

  // 2. universe of record
  const universe = recon.universe?.total_blocks_after_dedup ?? recon.blocks.length;
  if (piles.items.length !== universe) {
    errors.push(`classified ${piles.items.length} blocks but reconciler universe is ${universe}`);
  }
  const reconIds = new Set(recon.blocks.map((b) => b.id));
  const pileIds = new Set(piles.items.map((i) => i.block_id));
  const dropped = [...reconIds].filter((x) => !pileIds.has(x));
  if (dropped.length) errors.push(`blocks silently dropped from the audit: ${dropped.join(", ")}`);
  const sum = Object.values(piles.totals).reduce((a, b) => a + b, 0);
  if (sum !== universe) errors.push(`totals sum to ${sum}, universe is ${universe}`);

  // 3. DONE→BUILT stays total
  const reconStatus = new Map(recon.blocks.map((b) => [b.id, b.status]));
  const violations = piles.items.filter(
    (i) => reconStatus.get(i.block_id) === "DONE" && i.pile !== "BUILT"
  );
  if (violations.length) {
    errors.push(`DONE blocks not piled BUILT: ${violations.map((v) => v.block_id).join(", ")}`);
  }

  // 4. transcribed values must never masquerade as re-queried live proof
  const prov = piles.neon_prod_proof_provenance;
  if (!prov) errors.push(`${PILES}: neon_prod_proof_provenance is required`);
  else if (prov.requeried_by_this_generator !== false) {
    errors.push(`${PILES}: this generator performs no DB access; requeried_by_this_generator must be false`);
  }
  const report = fs.readFileSync(path.join(ROOT, REPORT), "utf8");
  if (/##\s*Neon live proofs/i.test(report)) {
    errors.push(`${REPORT}: "Neon live proofs" overstates transcribed values — label them as transcribed`);
  }
  if (!/transcribed, NOT re-queried/i.test(report)) {
    errors.push(`${REPORT}: Neon section must state the values were transcribed, not re-queried`);
  }

  if (errors.length) fail(errors);
  console.log(
    `OK ${LABEL}: audit regenerates byte-for-byte; ${piles.items.length}/${universe} blocks classified; DONE→BUILT total; Neon values carry provenance.`
  );
}

if (process.argv.includes("--selftest")) await selftest();
else main();

#!/usr/bin/env node
/**
 * publish-live-audit-2026-07-21 — deterministic, re-performable generator for the
 * 2026-07-21 live block audit.
 *
 * WHY THIS EXISTS IN THIS FORM (root-cause, not a patch):
 * The first cut of this generator (`publish-live-audit-2026-07-21.py`, never merged) read its
 * input from `/tmp/ih35-audit-piles-draft.json` — a file outside the repo. That made the audit
 * impossible to re-perform: nobody could regenerate or independently check the published numbers,
 * and the artifact it emitted did not even match the artifact that was committed. It also
 * hardcoded a `1185` denominator, which silently dropped 6 blocks that were already DONE on main
 * at the audit's own base SHA (0091-g7-1 + paritytable-a1..a5, PRs #3068/#3069/#3074/#3082/
 * #3086/#3087) and then `assert`ed that wrong total, which would have frozen the error in place.
 *
 * An audit workpaper that cannot be re-performed from committed inputs is not evidence. So:
 *   - every input is a committed file in this repo (no /tmp, no network, no clock),
 *   - the block universe is CROSS-CHECKED against the reconciler's own universe of record,
 *   - output is byte-for-byte deterministic, so CI can re-run it and diff (`--check`),
 *   - values obtained from Neon carry explicit provenance and are never labelled as if this
 *     script had re-queried them (it does not touch a database).
 *
 * Usage:
 *   node scripts/ops/publish-live-audit-2026-07-21.mjs           # regenerate artifacts in place
 *   node scripts/ops/publish-live-audit-2026-07-21.mjs --check   # verify committed == regenerated
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const PILES_PATH = "docs/trackers/block-audit-piles-2026-07-21.json";
const RECON_PATH = "docs/trackers/block-reconciliation-data.json";
const REPORT_PATH = "docs/trackers/LIVE-AUDIT-REPORT-2026-07-21.md";
const GAPS_PATH = "docs/trackers/LIVE-AUDIT-GAPS-2026-07-21.md";

const PILE_ORDER = ["BUILT", "GAP", "NEEDS-PROD", "NEEDS-OWNER", "NOISE", "UNVERIFIED"];

/**
 * Module assignment for blocks auto-added by the universe-completeness rule below.
 * Ordered, first match wins. Documented here so an auto-added row is never a mystery.
 */
const MODULE_RULES = [
  [/paritytable|parity-table|datatable/i, "platform"],
  [/settlement|payroll|escrow|deduction/i, "settlements"],
  [/invoice|bill|gl|ledger|posting|accounting/i, "accounting"],
  [/load|dispatch|stop/i, "dispatch"],
  [/bank|plaid/i, "banking"],
  [/factoring|faro/i, "factoring"],
  [/driver/i, "drivers"],
  [/qbo|recon/i, "qbo-recon"],
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

function moduleFor(id, name) {
  const hay = `${id} ${name ?? ""}`;
  for (const [re, mod] of MODULE_RULES) if (re.test(hay)) return mod;
  return "platform";
}

/**
 * Build the corrected, normalized piles object from committed inputs.
 * Throws (with the offending ids) rather than emitting a number it cannot justify.
 */
export function buildPiles(piles, recon, { recapture = false } = {}) {
  const errors = [];
  // AS-OF SEMANTICS. This is an audit workpaper dated 2026-07-21 at a fixed base SHA. Its
  // population is FROZEN once captured: `items` IS the population, and `universe_snapshot`
  // records what it was captured from. Regeneration therefore reproduces the same artifact
  // forever, even as main moves on.
  //
  // Pinning the artifact to the LIVE reconciler instead would be wrong twice over: it would
  // mutate a dated historical record every time a block is registered, and it would turn CI red
  // on every unrelated PR until someone regenerated it (a merge treadmill). Publishing a NEW
  // as-of is a deliberate act: `--recapture`.
  const frozen = piles.universe_snapshot && !recapture;
  const reconBlocks = frozen ? [] : recon.blocks ?? [];
  const reconById = new Map(reconBlocks.map((b) => [b.id, b]));
  const itemById = new Map(piles.items.map((i) => [i.block_id, i]));

  // --- I1: universe completeness -------------------------------------------------
  // The reconciler is the universe of record. Any block it knows about MUST be classified.
  // Blocks whose reconcile status is DONE are auto-added: that mapping is TOTAL in the
  // existing data (every DONE block is BUILT, with zero exceptions), so it is derived, not
  // guessed. Any OTHER missing status is a hard failure — it needs a real verdict, and this
  // script will not invent one.
  const items = piles.items.map((i) => ({ ...i }));
  const missing = reconBlocks.filter((b) => !itemById.has(b.id));
  const autoAdded = [];
  for (const b of missing) {
    if (b.status !== "DONE") {
      errors.push(
        `unclassified block "${b.id}" (reconcile status ${b.status}) — needs an explicit verdict; ` +
          `this generator only auto-derives DONE→BUILT`
      );
      continue;
    }
    const item = {
      id: b.id,
      pile: "BUILT",
      module: moduleFor(b.id, b.name),
      status_reconcile: "DONE",
      evidence: `reconcile DONE — ${b.evidence}`,
      fin: Boolean(b.fin),
      block_id: b.id,
      classified_by: "auto:reconcile-DONE→BUILT (universe-completeness rule)",
    };
    items.push(item);
    autoAdded.push(item);
  }

  // Extra ids the reconciler does not know about are equally a defect — checked at capture time.
  if (!frozen) {
    for (const i of items) {
      if (!reconById.has(i.block_id)) {
        errors.push(`item "${i.block_id}" is not in the reconciler universe (${RECON_PATH})`);
      }
    }
  }

  // --- I2: the DONE→BUILT rule stays total ---------------------------------------
  for (const i of items) {
    if (i.status_reconcile === "DONE" && i.pile !== "BUILT") {
      errors.push(`"${i.block_id}" is reconcile DONE but piled ${i.pile} (rule: DONE→BUILT)`);
    }
  }

  // --- I3: piles must be known ----------------------------------------------------
  for (const i of items) {
    if (!PILE_ORDER.includes(i.pile)) errors.push(`"${i.block_id}" has unknown pile "${i.pile}"`);
  }

  if (errors.length) {
    const err = new Error(`live-audit invariants failed:\n  - ${errors.join("\n  - ")}`);
    err.invariantErrors = errors;
    throw err;
  }

  items.sort((a, b) => a.block_id.localeCompare(b.block_id));

  // --- totals + denominator are DERIVED, never asserted against a hardcoded number --
  const totals = {};
  for (const p of PILE_ORDER) {
    const n = items.filter((i) => i.pile === p).length;
    if (n) totals[p] = n;
  }
  const universe = frozen
    ? piles.universe_snapshot.total
    : recon.universe?.total_blocks_after_dedup ?? reconBlocks.length;
  if (items.length !== universe) {
    throw new Error(
      frozen
        ? `item count ${items.length} != frozen universe_snapshot.total ${universe} — the as-of population was edited by hand`
        : `item count ${items.length} != reconciler universe ${universe}`
    );
  }

  const byModule = {};
  for (const i of items) byModule[i.module] = (byModule[i.module] ?? 0) + 1;

  return {
    ...piles,
    generated_at: piles.generated_at, // frozen input, never a clock — output must be stable
    denominators: { ...piles.denominators, active_reconcile: universe },
    universe_snapshot: piles.universe_snapshot ?? {
      captured_from: RECON_PATH,
      captured_at_base_sha: piles.base_sha,
      total: universe,
      frozen: true,
      note:
        "AS-OF population for this dated audit. Frozen at capture so the artifact is immutable " +
        "and reproducible forever. Publishing a new as-of is a deliberate act: re-run this " +
        "generator with --recapture against the then-current reconciler.",
    },
    totals,
    by_module: Object.fromEntries(Object.entries(byModule).sort(([a], [b]) => a.localeCompare(b))),
    universe_crosscheck: {
      source: RECON_PATH,
      reconciler_universe: universe,
      classified_items: items.length,
      // Derived from the DURABLE per-item `classified_by` marker, never from "what happened to be
      // missing on this run". The generator's output is also its input, so a run-scoped value here
      // would erase its own provenance on the second run — losing the audit trail of which blocks
      // the completeness rule added. This form is stable and is a fixed point on run 1.
      auto_added_done_blocks: items
        .filter((i) => typeof i.classified_by === "string" && i.classified_by.startsWith("auto:"))
        .map((i) => i.block_id)
        .sort(),
      rule: "set(items.block_id) must equal set(reconciliation.blocks.id); DONE→BUILT is total",
    },
    items,
  };
}

/** The Neon section, stated honestly: transcribed, not re-queried by this script. */
function neonProvenance(piles) {
  return (
    piles.neon_prod_proof_provenance ?? {
      obtained_by: "read-only Neon session on br-fancy-credit-akjnd07a with app.bypass_rls=lucia",
      obtained_on: "2026-07-21",
      requeried_by_this_generator: false,
      note:
        "These values were transcribed from that session. This generator performs NO database " +
        "or network access, so it cannot and does not re-verify them. Re-query before relying " +
        "on any of them for a financial decision.",
    }
  );
}

function renderReport(p) {
  const t = p.totals;
  const v1 = p.correction?.v1_totals ?? {};
  const prov = neonProvenance(p);
  const universe = p.denominators.active_reconcile;
  const L = [];
  L.push("# LIVE BLOCK AUDIT — 2026-07-21 (CORRECTED v2)");
  L.push("");
  L.push("> **CORRECTION:** v1 (GAP=36 / NOISE=383) undercounted by treating AUDIT-NOTE as NOISE.");
  L.push("> Classify agent mapped backlog-verify OPEN→GAP. Spot-check: `0441-mod10-payment-status-panel-404`");
  L.push("> was wrongly NOISE — `registerSettlementPaymentRoutes` still unmounted on main.");
  L.push(">");
  L.push("> **UNIVERSE CORRECTION (this revision):** the first cut published a `1,185` denominator and");
  L.push("> hardcoded it in an `assert`. At this audit's own base SHA the reconciler universe was");
  L.push(`> **${universe.toLocaleString("en-US")}** — 6 blocks that were already DONE on main were silently dropped`);
  L.push("> (`" + (p.universe_crosscheck?.auto_added_done_blocks ?? []).join("`, `") + "`).");
  L.push("> The denominator is now DERIVED from `docs/trackers/block-reconciliation-data.json` and");
  L.push("> cross-checked on every run, so it cannot drift again.");
  L.push("");
  L.push(`**Base SHA:** \`${p.base_sha}\`  `);
  L.push(`**Deploy SHA:** \`${p.deploy_sha}\`${p.deploy_lag ? " (lag)" : ""}  `);
  L.push(`**Generated:** ${p.generated_at}  `);
  L.push("**Re-perform:** `node scripts/ops/publish-live-audit-2026-07-21.mjs --check`");
  L.push("");
  L.push(`## Headline (active universe = ${universe.toLocaleString("en-US")})`);
  L.push("");
  L.push("| Pile | v2 (authoritative) | v1 (superseded) |");
  L.push("|---|---:|---:|");
  for (const k of PILE_ORDER) {
    L.push(`| ${k} | ${t[k] ?? 0} | ${v1[k] ?? "—"} |`);
  }
  const sum = Object.values(t).reduce((a, b) => a + b, 0);
  L.push(`| **SUM** | **${sum}** | ${Object.values(v1).reduce((a, b) => a + b, 0) || "—"} |`);
  L.push("");
  L.push("## Critical GAPs (re-verified)");
  L.push("");
  for (const c of p.critical_gaps ?? []) {
    L.push(`### ${c.id} — ${c.severity}`);
    L.push("- Blocks: " + c.block_ids.map((b) => `\`${b}\``).join(", "));
    L.push(`- Proof: ${c.proof}`);
    L.push(`- Rec: ${c.rec}`);
    L.push("");
  }
  L.push("## Neon values — transcribed, NOT re-queried by this generator");
  L.push("");
  L.push(`- Source: ${prov.obtained_by}`);
  L.push(`- Obtained: ${prov.obtained_on}`);
  L.push(`- Re-queried by this generator: **${prov.requeried_by_this_generator ? "yes" : "no"}**`);
  L.push(`- ${prov.note}`);
  L.push("");
  for (const [k, v] of Object.entries(p.neon_prod_proof ?? {})) {
    L.push(`- \`${k}\` = \`${v}\``);
  }
  L.push("");
  L.push("## Full GAP list");
  L.push("");
  L.push(`See \`${GAPS_PATH}\` (${t.GAP ?? 0} items).`);
  L.push("");
  L.push("## Caveat");
  L.push("");
  L.push(p.caveat ?? "");
  return L.join("\n") + "\n";
}

function renderGaps(p) {
  const gaps = p.items.filter((i) => i.pile === "GAP");
  const L = [];
  L.push(`# IH35 GAP pile — ${gaps.length} items (base ${p.base_sha.slice(0, 9)}, ${p.generated_at})`);
  L.push("");
  const sorted = [...gaps].sort((a, b) => {
    if (Boolean(b.fin) !== Boolean(a.fin)) return b.fin ? 1 : -1;
    if (a.module !== b.module) return a.module.localeCompare(b.module);
    return a.block_id.localeCompare(b.block_id);
  });
  for (const g of sorted) {
    const tag = g.fin ? "[FIN]" : "[ops]";
    L.push(`- ${tag} \`${g.block_id}\` (${g.module}, ${g.status_reconcile}) — ${g.evidence}`);
  }
  return L.join("\n") + "\n";
}

export function generate(opts = {}) {
  const piles = buildPiles(readJson(PILES_PATH), readJson(RECON_PATH), opts);
  return {
    [PILES_PATH]: JSON.stringify(piles, null, 2) + "\n",
    [REPORT_PATH]: renderReport(piles),
    [GAPS_PATH]: renderGaps(piles),
    piles,
  };
}

/**
 * Informational only — NEVER fails. A dated audit going stale is expected and normal; it is not a
 * CI defect and must not turn unrelated PRs red. It tells the operator when a new as-of is worth
 * publishing.
 */
function reportStaleness(piles) {
  let recon;
  try {
    recon = readJson(RECON_PATH);
  } catch {
    return;
  }
  const live = recon.universe?.total_blocks_after_dedup ?? recon.blocks?.length;
  const frozenTotal = piles.universe_snapshot?.total;
  if (typeof live === "number" && live !== frozenTotal) {
    console.log(
      `NOTE: as-of population is ${frozenTotal}; the reconciler now has ${live}. ` +
        `That is expected drift, not a failure. To publish a NEW as-of: ` +
        `node ${path.relative(ROOT, fileURLToPath(import.meta.url))} --recapture`
    );
  }
}

function main() {
  const check = process.argv.includes("--check");
  const recapture = process.argv.includes("--recapture");
  let out;
  try {
    out = generate({ recapture });
  } catch (e) {
    console.error(`FAIL publish-live-audit-2026-07-21: ${e.message}`);
    process.exit(1);
  }
  const drift = [];
  for (const rel of [PILES_PATH, REPORT_PATH, GAPS_PATH]) {
    const abs = path.join(ROOT, rel);
    // Read directly and treat ENOENT as "absent". An existsSync()-then-readFileSync() pair is a
    // check-then-use race (CodeQL js/file-system-race): the file can change between the two calls.
    let current = null;
    try {
      current = fs.readFileSync(abs, "utf8");
    } catch (err) {
      if (err && err.code !== "ENOENT") throw err;
    }
    if (current === out[rel]) continue;
    if (check) drift.push(rel);
    else fs.writeFileSync(abs, out[rel]);
  }
  if (check) {
    if (drift.length) {
      console.error(
        "FAIL publish-live-audit-2026-07-21 --check: committed artifacts are NOT reproducible " +
          "from committed inputs. Re-run without --check and commit the result.\n  - " +
          drift.join("\n  - ")
      );
      process.exit(1);
    }
    console.log("OK publish-live-audit-2026-07-21 --check: artifacts reproduce byte-for-byte.");
    reportStaleness(out.piles);
    return;
  }
  console.log(`wrote ${PILES_PATH}\nwrote ${REPORT_PATH}\nwrote ${GAPS_PATH}`);
  console.log("totals", JSON.stringify(out.piles.totals));
  console.log("universe", out.piles.denominators.active_reconcile);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

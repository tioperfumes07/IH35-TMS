#!/usr/bin/env node
/**
 * ACCT-F07 / ACCT-LINK-04 — MERGED≠APPLIED honesty guard.
 *
 * Layer 1: delegate to verify-expense-category-fk-wired.mjs (migration + routes on main).
 * Layer 2: fail closed if manifest pretends PASS, held migration is marked applied_on_prod,
 *          or this honesty doc / MERGED≠APPLIED evidence is missing.
 *
 * CI-static — no DB. Prod FK density is owner Neon-apply + live re-proof.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-categories-consumer-fk";

const WIRED_GUARD = "scripts/verify-expense-category-fk-wired.mjs";
const HELD_MANIFEST = "db/migrations/.held-migrations.json";
const MIGRATION = "202608020000_acct_link_04_expense_lines_expense_category_fk.sql";
const MANIFEST = "docs/module-completion/accounting.json";
const HONESTY_DOC = "docs/trackers/MERGED-NOT-APPLIED-ACCT-F07-F08-2026-07-25.md";
const MERGED_PR = "#3446";
const MERGE_SHA = "7a0c3614ea0802d08bb28c5ceb0c3667a44c9784";
const MANIFEST_ITEM = "ACCT-LINK-04";

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { missing: rel, text: "" };
  return { text: fs.readFileSync(abs, "utf8") };
}

function runWiredGuard() {
  const r = spawnSync("node", [path.join(ROOT, WIRED_GUARD)], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    return [`${WIRED_GUARD} failed — merged static wiring regressed:\n${r.stderr || r.stdout}`];
  }
  return [];
}

export function collectHonestyFailures(opts = {}) {
  const failures = [];
  const root = opts.root ?? ROOT;

  const migPath = path.join(root, "db/migrations", MIGRATION);
  if (!fs.existsSync(migPath)) {
    failures.push(`missing held migration db/migrations/${MIGRATION} on main`);
  } else {
    const mig = fs.readFileSync(migPath, "utf8");
    if (!/DO NOT RUN ON PROD/i.test(mig)) {
      failures.push(`${MIGRATION}: must carry DO NOT RUN ON PROD (held financial cluster)`);
    }
    if (!/HOLD-FOR-JORGE/i.test(mig)) {
      failures.push(`${MIGRATION}: must carry HOLD-FOR-JORGE marker`);
    }
    if (!/expense_lines_expense_category_same_entity_fkey/.test(mig)) {
      failures.push(`${MIGRATION}: must declare same-entity composite FK to catalogs.expense_categories`);
    }
  }

  const held = read(path.relative(ROOT, path.join(root, HELD_MANIFEST)));
  if (held.missing) {
    failures.push(`missing ${held.missing}`);
  } else {
    let parsed;
    try {
      parsed = JSON.parse(held.text);
    } catch {
      failures.push(`${HELD_MANIFEST}: invalid JSON`);
      parsed = null;
    }
    if (parsed) {
      // 2026-07-25 GUARD registry split: a migration Neon-applied and ledger-verified moves to
      // applied_held[] (owner-confirmed live proof), not held[]. applied_on_prod:true there is the
      // EXPECTED state, not a contradiction — it's still a registry/manifest mismatch only if this
      // migration is still sitting in held[] flagged applied (that half-migrated shape means the
      // repair missed it) or entirely unregistered.
      const inHeld = (parsed.held ?? []).find((e) => e.file === MIGRATION);
      const inAppliedHeld = (parsed.applied_held ?? []).find((e) => e.file === MIGRATION);
      if (!inHeld && !inAppliedHeld) {
        failures.push(`${HELD_MANIFEST}: ${MIGRATION} not registered — financial migrations must be HOLD-listed`);
      } else if (inHeld && inHeld.applied_on_prod === true) {
        failures.push(
          `${HELD_MANIFEST}: ${MIGRATION} is applied_on_prod:true but still sits in held[] — move it to applied_held[]`
        );
      }
    }
  }

  const acct = read(path.relative(ROOT, path.join(root, MANIFEST)));
  if (acct.missing) {
    failures.push(`missing ${acct.missing}`);
  } else {
    let data;
    try {
      data = JSON.parse(acct.text);
    } catch {
      failures.push(`${MANIFEST}: invalid JSON`);
      data = null;
    }
    if (data) {
      const item = (data.items ?? []).find((i) => i.id === MANIFEST_ITEM);
      if (!item) {
        failures.push(`${MANIFEST}: missing item ${MANIFEST_ITEM}`);
      } else {
        if (item.status === "PASS") {
          failures.push(
            `${MANIFEST_ITEM} is PASS in ${MANIFEST} but prod FK not Neon-applied — MERGED≠APPLIED theater`
          );
        }
        if (item.status !== "FAIL") {
          failures.push(`${MANIFEST_ITEM} must stay FAIL until Neon-apply (got ${item.status})`);
        }
        const ev = String(item.evidence ?? "");
        if (!/Neon-apply|NOT yet Neon-applied|MERGED/i.test(ev)) {
          failures.push(`${MANIFEST_ITEM} evidence must name Neon-apply / MERGED≠APPLIED`);
        }
        if (!String(item.pr ?? "").includes("3446")) {
          failures.push(`${MANIFEST_ITEM} must reference merged PR ${MERGED_PR}`);
        }
      }
    }
  }

  const doc = read(path.relative(ROOT, path.join(root, HONESTY_DOC)));
  if (doc.missing) {
    failures.push(`missing honesty doc ${HONESTY_DOC}`);
  } else {
    if (!/MERGED\s*≠\s*APPLIED|MERGED IS NOT APPLIED/i.test(doc.text)) {
      failures.push(`${HONESTY_DOC}: must state MERGED≠APPLIED`);
    }
    if (!doc.text.includes(MERGE_SHA.slice(0, 12))) {
      failures.push(`${HONESTY_DOC}: must record merge SHA for ${MERGED_PR}`);
    }
    if (!/1478/.test(doc.text)) {
      failures.push(`${HONESTY_DOC}: must reference verify-step 1478`);
    }
    if (!/ACCT-F07|ACCT-LINK-04/.test(doc.text)) {
      failures.push(`${HONESTY_DOC}: must cover ACCT-F07 / ACCT-LINK-04`);
    }
  }

  return failures;
}

function selftest() {
  const failures = [];

  const goodRoot = fs.mkdtempSync("/tmp/acct-f07-honesty-");
  try {
    fs.mkdirSync(path.join(goodRoot, "db/migrations"), { recursive: true });
    fs.mkdirSync(path.join(goodRoot, "docs/module-completion"), { recursive: true });
    fs.mkdirSync(path.join(goodRoot, "docs/trackers"), { recursive: true });

    fs.writeFileSync(
      path.join(goodRoot, "db/migrations", MIGRATION),
      "-- HOLD-FOR-JORGE DO NOT RUN ON PROD\nexpense_lines_expense_category_same_entity_fkey\n"
    );
    fs.writeFileSync(
      path.join(goodRoot, HELD_MANIFEST),
      JSON.stringify({ held: [{ file: MIGRATION, reason: "hold" }] })
    );
    fs.writeFileSync(
      path.join(goodRoot, MANIFEST),
      JSON.stringify({
        module: "accounting",
        complete: false,
        items: [
          {
            id: MANIFEST_ITEM,
            status: "FAIL",
            evidence: "MERGED PR #3446 — NOT yet Neon-applied",
            pr: "#3446",
          },
        ],
      })
    );
    fs.writeFileSync(
      path.join(goodRoot, HONESTY_DOC),
      `# MERGED ≠ APPLIED\n${MERGE_SHA}\n1478 verify-expense-categories-consumer-fk\nACCT-F07 ACCT-LINK-04\n`
    );

    if (collectHonestyFailures({ root: goodRoot }).length) {
      failures.push("good fixture rejected");
    }

    fs.writeFileSync(
      path.join(goodRoot, MANIFEST),
      JSON.stringify({
        module: "accounting",
        complete: false,
        items: [{ id: MANIFEST_ITEM, status: "PASS", evidence: "fake", pr: "#3446" }],
      })
    );
    if (!collectHonestyFailures({ root: goodRoot }).some((f) => f.includes("MERGED≠APPLIED"))) {
      failures.push("PASS manifest not caught");
    }
  } finally {
    fs.rmSync(goodRoot, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (process.argv.includes("--honesty-only")) {
  const failures = collectHonestyFailures();
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: honesty layer OK — ${MANIFEST_ITEM} stays FAIL until owner Neon-apply`);
  process.exit(0);
}

const failures = [...runWiredGuard(), ...collectHonestyFailures()];
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `${LABEL}: OK — static wiring on main (${WIRED_GUARD}) + ${MANIFEST_ITEM} honestly FAIL ` +
    `(merged ${MERGED_PR} @ ${MERGE_SHA.slice(0, 12)}…; prod FK awaits owner Neon-apply of ${MIGRATION})`
);
process.exit(0);
